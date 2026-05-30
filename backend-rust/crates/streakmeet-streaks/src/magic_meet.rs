//! Magic meet orchestration — parity with `backend/src/streaks/magicMeet.ts` + `meet.ts`.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use streakmeet_face::{
    best_face_match_in_gallery, collect_face_candidates, ensure_face_service,
    face_error_from_exception, face_match_threshold_partner, face_match_threshold_self,
    is_valid_embedding, pick_best_frame, FaceCandidate, CURRENT_FACE_MODEL, MAGIC_MEET_MAX_FRAMES,
};
use streakmeet_sync::OutboxPublisher;
use streakmeet_types::{codes, ApiError};

use crate::calendar::instant_meet_streak_day;
use crate::meet::{record_meet_for_streak, RecordMeetInput};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicMeetPartnerJson {
    pub nickname: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicMeetResultJson {
    pub extended: Vec<MagicMeetPartnerJson>,
    pub added: Vec<MagicMeetPartnerJson>,
    pub skipped_duplicates: Vec<String>,
    pub partners: Vec<MagicMeetPartnerJson>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicMeetLocation {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MagicMeetInput {
    pub photo_base64: Option<String>,
    pub photos_base64: Option<Vec<String>>,
    pub location: Option<MagicMeetLocation>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ActiveStreakRow {
    id: String,
    timezone: String,
    user_a_id: String,
    user_b_id: String,
    user_a_nickname: String,
    user_a_avatar_url: Option<String>,
    user_a_face_enrolled: bool,
    user_b_nickname: String,
    user_b_avatar_url: Option<String>,
    user_b_face_enrolled: bool,
}

#[derive(Debug, sqlx::FromRow)]
struct FaceEnrolledRow {
    face_enrolled: bool,
}

#[derive(Debug, sqlx::FromRow)]
struct EmbeddingRow {
    vector: serde_json::Value,
}

struct MatchedEntry {
    streak: ActiveStreakRow,
    partner_id: String,
    partner_nickname: String,
    partner_avatar_url: Option<String>,
    match_sim: f64,
}

pub fn normalize_photos(input: &MagicMeetInput) -> Vec<String> {
    if let Some(photos) = &input.photos_base64 {
        if !photos.is_empty() {
            return photos.iter().take(MAGIC_MEET_MAX_FRAMES).cloned().collect();
        }
    }
    if let Some(photo) = &input.photo_base64 {
        if !photo.is_empty() {
            return vec![photo.clone()];
        }
    }
    vec![]
}

async fn load_user_gallery(pool: &PgPool, user_id: &str) -> Result<Vec<Vec<f64>>, ApiError> {
    let enrolled = sqlx::query_as::<_, FaceEnrolledRow>(
        r#"SELECT "faceEnrolled" AS face_enrolled FROM users WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    if !enrolled.face_enrolled {
        return Err(ApiError::new(400, codes::FACE_NOT_ENROLLED, None));
    }

    let rows = sqlx::query_as::<_, EmbeddingRow>(
        r#"SELECT vector FROM face_embeddings WHERE "userId" = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let gallery: Vec<Vec<f64>> = rows
        .iter()
        .filter_map(|r| is_valid_embedding(&r.vector))
        .collect();

    if gallery.is_empty() {
        return Err(ApiError::new(400, codes::FACE_LEGACY_EMBEDDING, None));
    }
    Ok(gallery)
}

async fn load_partner_gallery(pool: &PgPool, partner_id: &str) -> Option<Vec<Vec<f64>>> {
    let rows = sqlx::query_as::<_, EmbeddingRow>(
        r#"SELECT vector FROM face_embeddings WHERE "userId" = $1"#,
    )
    .bind(partner_id)
    .fetch_all(pool)
    .await
    .ok()?;

    let gallery: Vec<Vec<f64>> = rows
        .iter()
        .filter_map(|r| is_valid_embedding(&r.vector))
        .collect();
    if gallery.is_empty() {
        None
    } else {
        Some(gallery)
    }
}

async fn load_active_streaks(pool: &PgPool, user_id: &str) -> Result<Vec<ActiveStreakRow>, ApiError> {
    sqlx::query_as::<_, ActiveStreakRow>(
        r#"
        SELECT
            s.id,
            s.timezone,
            s."userAId" AS user_a_id,
            s."userBId" AS user_b_id,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ua."faceEnrolled" AS user_a_face_enrolled,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url,
            ub."faceEnrolled" AS user_b_face_enrolled
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.active = true AND (s."userAId" = $1 OR s."userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

fn match_partners(
    user_id: &str,
    pool_faces: &[FaceCandidate],
    my_face_idx: usize,
    streaks: &[ActiveStreakRow],
    partner_galleries: &[(String, Vec<Vec<f64>>)],
) -> Vec<MatchedEntry> {
    let partner_probes: Vec<Vec<f64>> = pool_faces
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != my_face_idx)
        .map(|(_, c)| c.embedding.clone())
        .collect();

    let mut matched = Vec::new();
    for streak in streaks {
        let (partner_id, partner_nickname, partner_avatar, face_enrolled) = if streak.user_a_id
            == user_id
        {
            (
                streak.user_b_id.clone(),
                streak.user_b_nickname.clone(),
                streak.user_b_avatar_url.clone(),
                streak.user_b_face_enrolled,
            )
        } else {
            (
                streak.user_a_id.clone(),
                streak.user_a_nickname.clone(),
                streak.user_a_avatar_url.clone(),
                streak.user_a_face_enrolled,
            )
        };

        if !face_enrolled {
            continue;
        }
        let Some(gallery) = partner_galleries
            .iter()
            .find(|(id, _)| id == &partner_id)
            .map(|(_, g)| g)
        else {
            continue;
        };
        if gallery.is_empty() {
            continue;
        }

        let m = best_face_match_in_gallery(&partner_probes, gallery);
        if m.sim < face_match_threshold_partner() {
            tracing::debug!(
                partner = %partner_nickname,
                sim = m.sim,
                "magic-meet partner not matched"
            );
            continue;
        }
        tracing::debug!(partner = %partner_nickname, sim = m.sim, "magic-meet partner matched");
        matched.push(MatchedEntry {
            streak: streak.clone(),
            partner_id,
            partner_nickname,
            partner_avatar_url: partner_avatar,
            match_sim: m.sim,
        });
    }
    matched
}

async fn persist_matches(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    matched: &[MatchedEntry],
    best_photo_base64: &str,
    photo_hash: &str,
    location: Option<&MagicMeetLocation>,
    user_id: &str,
    pool_faces: &[FaceCandidate],
    self_sim: f64,
) -> Result<(Vec<MagicMeetPartnerJson>, Vec<MagicMeetPartnerJson>, Vec<String>), ApiError> {
    let mut extended = Vec::new();
    let mut added = Vec::new();
    let mut skipped_duplicates = Vec::new();
    let mut saved_photo_url: Option<String> = None;

    for entry in matched {
        let today = instant_meet_streak_day(&entry.streak.timezone, Utc::now());
        if saved_photo_url.is_none() {
            saved_photo_url = Some(
                streakmeet_media::save_base64_image_as_avif(
                    best_photo_base64,
                    &format!("{}_{user_id}", Utc::now().timestamp_millis()),
                )
                .await
                .map_err(|_| ApiError::new(500, codes::IMAGE_SAVE_FAILED, None))?,
            );
        }
        let photo_url = saved_photo_url.as_ref().unwrap();
        let match_scores = serde_json::json!({
            "self": self_sim,
            "partner": entry.match_sim,
            "model": CURRENT_FACE_MODEL,
        });

        let meet_result = record_meet_for_streak(
            pool,
            publisher,
            RecordMeetInput {
                streak_id: &entry.streak.id,
                calendar_date: &today,
                uploaded_by_id: user_id,
                photo_url,
                photo_hash,
                latitude: location.map(|l| l.lat),
                longitude: location.map(|l| l.lng),
                match_scores: Some(match_scores),
                faces_detected: Some(pool_faces.len() as i32),
            },
        )
        .await?;

        if meet_result.duplicate {
            skipped_duplicates.push(entry.partner_nickname.clone());
            continue;
        }

        let partner_info = MagicMeetPartnerJson {
            nickname: entry.partner_nickname.clone(),
            avatar_url: entry.partner_avatar_url.clone(),
        };
        if meet_result.extended {
            extended.push(partner_info);
        } else {
            added.push(partner_info);
        }
    }

    Ok((extended, added, skipped_duplicates))
}

pub async fn process_magic_meet(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    input: MagicMeetInput,
) -> Result<MagicMeetResultJson, ApiError> {
    let photos = normalize_photos(&input);
    if photos.is_empty() {
        return Err(ApiError::new(400, codes::MAGIC_MEET_PHOTO_REQUIRED, None));
    }

    let my_gallery = load_user_gallery(pool, user_id).await?;

    let pool_faces = match ensure_face_service().await {
        Ok(()) => match collect_face_candidates(&photos).await {
            Ok(faces) => faces,
            Err(err) => return Err(face_error_from_exception(&err)),
        },
        Err(err) => return Err(face_error_from_exception(&err)),
    };

    if pool_faces.len() < 2 {
        return Err(ApiError::new(
            400,
            codes::MAGIC_MEET_MIN_FACES,
            Some(&format!(
                "На фото должно быть минимум 2 лица (найдено: {})",
                pool_faces.len()
            )),
        ));
    }

    let pool_embeddings: Vec<Vec<f64>> = pool_faces.iter().map(|c| c.embedding.clone()).collect();
    let self_match = best_face_match_in_gallery(&pool_embeddings, &my_gallery);
    if self_match.sim < face_match_threshold_self() {
        return Err(ApiError::new(400, codes::MAGIC_MEET_USER_NOT_ON_PHOTO, None));
    }

    let my_face_idx = self_match.face_index as usize;
    let best_frame_idx = pick_best_frame(&pool_faces, my_face_idx).unwrap_or(0);
    let best_photo_base64 = photos
        .get(best_frame_idx)
        .ok_or_else(|| ApiError::new(400, codes::INVALID_PHOTO, None))?;

    let photo_hash = streakmeet_media::compute_photo_hash(best_photo_base64)
        .await
        .map_err(|_| ApiError::new(400, codes::INVALID_PHOTO, None))?;

    let active_streaks = load_active_streaks(pool, user_id).await?;

    let mut partner_galleries = Vec::new();
    for streak in &active_streaks {
        let partner_id = if streak.user_a_id == user_id {
            &streak.user_b_id
        } else {
            &streak.user_a_id
        };
        if partner_galleries.iter().any(|(id, _)| id == partner_id) {
            continue;
        }
        if let Some(gallery) = load_partner_gallery(pool, partner_id).await {
            partner_galleries.push((partner_id.clone(), gallery));
        }
    }

    let matched = match_partners(user_id, &pool_faces, my_face_idx, &active_streaks, &partner_galleries);

    let (extended, added, skipped_duplicates) = persist_matches(
        pool,
        publisher,
        &matched,
        best_photo_base64,
        &photo_hash,
        input.location.as_ref(),
        user_id,
        &pool_faces,
        self_match.sim,
    )
    .await?;

    let partners: Vec<_> = extended.iter().chain(added.iter()).cloned().collect();

    if partners.is_empty() {
        if !skipped_duplicates.is_empty() {
            let msg = if skipped_duplicates.len() == 1 {
                format!("Это фото уже было добавлено (с @{})", skipped_duplicates[0])
            } else {
                "Это фото уже было добавлено".to_string()
            };
            return Err(ApiError::new(400, codes::MAGIC_MEET_DUPLICATE_PHOTO, Some(&msg)));
        }
        return Err(ApiError::new(400, codes::MAGIC_MEET_NO_MATCH, None));
    }

    Ok(MagicMeetResultJson {
        extended,
        added,
        skipped_duplicates,
        partners,
    })
}

//! Meet recording — parity with `backend/src/streaks/meet.ts`.

use chrono::Utc;
use prost::Message;
use serde::Serialize;
use sqlx::PgPool;
use streakmeet_sync::{
    OutboxPublisher, enqueue_outbox, streak_meet_envelope, streak_photo_added_envelope,
};
use streakmeet_types::{ApiError, codes};

use crate::core::calendar::get_local_date_string;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordMeetResultJson {
    pub extended: bool,
    pub duplicate: bool,
    pub streak_day_id: String,
}

#[derive(Debug)]
pub struct RecordMeetInput<'a> {
    pub streak_id: &'a str,
    pub calendar_date: &'a str,
    pub uploaded_by_id: &'a str,
    pub photo_url: &'a str,
    pub photo_hash: &'a str,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub match_scores: Option<serde_json::Value>,
    pub faces_detected: Option<i32>,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakMetaRow {
    last_met_date: Option<String>,
    user_a_id: String,
    user_b_id: String,
    count: i32,
    timezone: String,
    user_a_nickname: String,
    user_a_avatar_url: Option<String>,
    user_b_nickname: String,
    user_b_avatar_url: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakDayIdRow {
    id: String,
}

async fn load_streak_row(pool: &PgPool, streak_id: &str) -> Result<StreakMetaRow, ApiError> {
    sqlx::query_as::<_, StreakMetaRow>(
        r#"
        SELECT
            s."lastMetDate" AS last_met_date,
            s."userAId" AS user_a_id,
            s."userBId" AS user_b_id,
            s.count,
            s.timezone,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.id = $1
        "#,
    )
    .bind(streak_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))
}

fn partner_for_viewer<'a>(
    row: &'a StreakMetaRow,
    viewer_id: &str,
) -> (&'a str, &'a str, Option<&'a str>) {
    if row.user_a_id == viewer_id {
        (
            &row.user_b_id,
            &row.user_b_nickname,
            row.user_b_avatar_url.as_deref(),
        )
    } else {
        (
            &row.user_a_id,
            &row.user_a_nickname,
            row.user_a_avatar_url.as_deref(),
        )
    }
}

pub async fn record_meet_for_streak(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    input: RecordMeetInput<'_>,
) -> Result<RecordMeetResultJson, ApiError> {
    let streak = load_streak_row(pool, input.streak_id).await?;

    let mut streak_day = sqlx::query_as::<_, StreakDayIdRow>(
        r#"
        SELECT id FROM streak_days
        WHERE "streakId" = $1 AND date = $2
        "#,
    )
    .bind(input.streak_id)
    .bind(input.calendar_date)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if let Some(ref day) = streak_day {
        let existing = sqlx::query_as::<_, (i32,)>(
            r#"
            SELECT 1 FROM meet_proofs
            WHERE "streakDayId" = $1 AND "photoHash" = $2
            LIMIT 1
            "#,
        )
        .bind(&day.id)
        .bind(input.photo_hash)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

        if existing.is_some() {
            return Ok(RecordMeetResultJson {
                extended: false,
                duplicate: true,
                streak_day_id: day.id.clone(),
            });
        }
    }

    let extended = streak.last_met_date.as_deref() != Some(input.calendar_date);

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let streak_day_id = if let Some(day) = streak_day.take() {
        day.id
    } else {
        let created = sqlx::query_as::<_, StreakDayIdRow>(
            r#"
            INSERT INTO streak_days ("streakId", date, status)
            VALUES ($1, $2, 'MET')
            RETURNING id
            "#,
        )
        .bind(input.streak_id)
        .bind(input.calendar_date)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        created.id
    };

    let new_count = if extended {
        streak.count + 1
    } else {
        streak.count
    };
    let new_last_met = if extended {
        Some(input.calendar_date.to_string())
    } else {
        streak.last_met_date.clone()
    };

    if extended {
        sqlx::query(
            r#"
            UPDATE streaks SET count = count + 1, "lastMetDate" = $2
            WHERE id = $1
            "#,
        )
        .bind(input.streak_id)
        .bind(input.calendar_date)
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

        sqlx::query(
            r#"
            UPDATE users SET "gemsBalance" = "gemsBalance" + 1
            WHERE id = ANY($1)
            "#,
        )
        .bind(&[streak.user_a_id.clone(), streak.user_b_id.clone()])
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    }

    sqlx::query(
        r#"
        INSERT INTO meet_proofs (
            "streakDayId", "uploadedById", "photoUrl", "photoHash",
            latitude, longitude, "facesDetected", "matchScores"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(&streak_day_id)
    .bind(input.uploaded_by_id)
    .bind(input.photo_url)
    .bind(input.photo_hash)
    .bind(input.latitude)
    .bind(input.longitude)
    .bind(input.faces_detected.unwrap_or(0))
    .bind(input.match_scores)
    .execute(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let last_met_str = new_last_met.clone().unwrap_or_default();
    let mut envelopes: Vec<(String, streakmeet_proto::SyncEnvelope, &'static str)> =
        Vec::with_capacity(2);
    for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
        let (partner_id, partner_nickname, partner_avatar) = partner_for_viewer(&streak, viewer_id);
        let (envelope, event_type) = if extended {
            (
                streak_meet_envelope(
                    input.uploaded_by_id,
                    input.streak_id,
                    new_count,
                    &last_met_str,
                    partner_id,
                    partner_nickname,
                    partner_avatar,
                ),
                "streaks.meet_extended",
            )
        } else {
            (
                streak_photo_added_envelope(
                    input.uploaded_by_id,
                    input.streak_id,
                    &streak_day_id,
                    input.photo_url,
                ),
                "streaks.photo_added",
            )
        };
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(&mut tx, viewer_id, event_type, &envelope.event_id, &bytes)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        envelopes.push((viewer_id.clone(), envelope, event_type));
    }

    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for (viewer_id, envelope, _) in envelopes {
        if let Err(err) = publisher.publish_inline(&viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %viewer_id, "inline meet publish failed");
        }
    }

    Ok(RecordMeetResultJson {
        extended,
        duplicate: false,
        streak_day_id,
    })
}

/// Record a meet for an active streak (simple upload stub for magic-meet path).
#[allow(clippy::too_many_arguments)]
pub async fn record_meet_upload(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    streak_id: &str,
    photo_base64: Option<&str>,
    photo_url: Option<&str>,
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<RecordMeetResultJson, ApiError> {
    let streak = load_streak_row(pool, streak_id).await?;
    if streak.user_a_id != user_id && streak.user_b_id != user_id {
        return Err(ApiError::new(404, codes::STREAK_NOT_FOUND, None));
    }

    let photo_url = if let Some(url) = photo_url.filter(|u| !u.is_empty()) {
        url.to_string()
    } else {
        let photo_base64 = photo_base64
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ApiError::new(400, codes::MAGIC_MEET_PHOTO_REQUIRED, None))?;
        streakmeet_media::save_base64_image_as_avif(
            pool,
            photo_base64,
            &format!("{}_{user_id}", Utc::now().timestamp_millis()),
        )
        .await
        .map_err(|_| ApiError::new(500, codes::IMAGE_SAVE_FAILED, None))?
    };

    let photo_hash = if let Some(photo_base64) = photo_base64.filter(|s| !s.is_empty()) {
        streakmeet_media::compute_photo_hash(photo_base64)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    } else {
        use sha2::{Digest, Sha256};
        format!("{:x}", Sha256::digest(photo_url.as_bytes()))
    };

    let calendar_date = get_local_date_string(&streak.timezone, Utc::now());

    record_meet_for_streak(
        pool,
        publisher,
        RecordMeetInput {
            streak_id,
            calendar_date: &calendar_date,
            uploaded_by_id: user_id,
            photo_url: &photo_url,
            photo_hash: &photo_hash,
            latitude,
            longitude,
            match_scores: None,
            faces_detected: None,
        },
    )
    .await
}

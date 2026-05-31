//! Memories data access — parity with `backend/src/memories/repository.ts`.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use streakmeet_streaks::partner_of;
use streakmeet_types::{ApiError, codes};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MeetProofRow {
    pub id: String,
    pub photo_url: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub uploaded_by_id: String,
    pub uploaded_by_nickname: String,
    pub streak_day_date: String,
    pub streak_id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub user_a_nickname: String,
    pub user_a_avatar_url: Option<String>,
    pub user_b_nickname: String,
    pub user_b_avatar_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MemoryPartner {
    pub id: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
}

pub async fn count_met_days_for_user(pool: &PgPool, user_id: &str) -> Result<i64, ApiError> {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM streak_days sd
        JOIN streaks s ON s.id = sd."streakId"
        WHERE sd.status = 'MET'
          AND (s."userAId" = $1 OR s."userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

pub async fn max_active_streak_count(pool: &PgPool, user_id: &str) -> Result<i32, ApiError> {
    let rows = sqlx::query_scalar::<_, i32>(
        r#"
        SELECT count FROM streaks
        WHERE active = true AND ("userAId" = $1 OR "userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows.into_iter().max().unwrap_or(0))
}

pub async fn list_met_days_for_user(
    pool: &PgPool,
    user_id: &str,
    streak_id: Option<&str>,
) -> Result<Vec<(String, String)>, ApiError> {
    let rows = if let Some(streak_id) = streak_id {
        sqlx::query_as::<_, (String, String)>(
            r#"
            SELECT sd."streakId", sd.date::text
            FROM streak_days sd
            JOIN streaks s ON s.id = sd."streakId"
            WHERE sd.status = 'MET'
              AND s.id = $2
              AND (s."userAId" = $1 OR s."userBId" = $1)
            ORDER BY sd.date ASC
            "#,
        )
        .bind(user_id)
        .bind(streak_id)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, (String, String)>(
            r#"
            SELECT sd."streakId", sd.date::text
            FROM streak_days sd
            JOIN streaks s ON s.id = sd."streakId"
            WHERE sd.status = 'MET'
              AND (s."userAId" = $1 OR s."userBId" = $1)
            ORDER BY sd.date ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows)
}

pub async fn list_meet_proofs_for_user(
    pool: &PgPool,
    user_id: &str,
    page: i32,
    limit: i32,
    streak_id: Option<&str>,
) -> Result<Vec<MeetProofRow>, ApiError> {
    let offset = ((page - 1) * limit) as i64;
    let limit = limit as i64;

    let rows = if let Some(streak_id) = streak_id {
        sqlx::query_as::<_, MeetProofRow>(
            r#"
            SELECT
                mp.id,
                mp."photoUrl" AS photo_url,
                mp.latitude,
                mp.longitude,
                mp."createdAt" AS created_at,
                mp."uploadedById" AS uploaded_by_id,
                u.nickname AS uploaded_by_nickname,
                sd.date::text AS streak_day_date,
                sd."streakId" AS streak_id,
                s."userAId" AS user_a_id,
                s."userBId" AS user_b_id,
                ua.nickname AS user_a_nickname,
                ua."avatarUrl" AS user_a_avatar_url,
                ub.nickname AS user_b_nickname,
                ub."avatarUrl" AS user_b_avatar_url
            FROM meet_proofs mp
            JOIN streak_days sd ON sd.id = mp."streakDayId"
            JOIN streaks s ON s.id = sd."streakId"
            JOIN users u ON u.id = mp."uploadedById"
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE s.id = $2
              AND (s."userAId" = $1 OR s."userBId" = $1)
            ORDER BY mp."createdAt" DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(user_id)
        .bind(streak_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, MeetProofRow>(
            r#"
            SELECT
                mp.id,
                mp."photoUrl" AS photo_url,
                mp.latitude,
                mp.longitude,
                mp."createdAt" AS created_at,
                mp."uploadedById" AS uploaded_by_id,
                u.nickname AS uploaded_by_nickname,
                sd.date::text AS streak_day_date,
                sd."streakId" AS streak_id,
                s."userAId" AS user_a_id,
                s."userBId" AS user_b_id,
                ua.nickname AS user_a_nickname,
                ua."avatarUrl" AS user_a_avatar_url,
                ub.nickname AS user_b_nickname,
                ub."avatarUrl" AS user_b_avatar_url
            FROM meet_proofs mp
            JOIN streak_days sd ON sd.id = mp."streakDayId"
            JOIN streaks s ON s.id = sd."streakId"
            JOIN users u ON u.id = mp."uploadedById"
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE (s."userAId" = $1 OR s."userBId" = $1)
            ORDER BY mp."createdAt" DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows)
}

pub fn partner_from_proof(user_id: &str, proof: &MeetProofRow) -> MemoryPartner {
    let partner = partner_of(
        &proof.user_a_id,
        &proof.user_b_id,
        &proof.user_a_nickname,
        proof.user_a_avatar_url.as_deref(),
        &proof.user_b_nickname,
        proof.user_b_avatar_url.as_deref(),
        user_id,
    );
    MemoryPartner {
        id: partner.id,
        nickname: partner.nickname,
        avatar_url: partner.avatar_url,
    }
}

pub async fn load_partner_by_streak_id(
    pool: &PgPool,
    user_id: &str,
    streak_id: Option<&str>,
) -> Result<std::collections::HashMap<String, MemoryPartner>, ApiError> {
    let rows = if let Some(streak_id) = streak_id {
        sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                String,
                Option<String>,
            ),
        >(
            r#"
            SELECT
                s.id,
                s."userAId",
                s."userBId",
                ua.nickname,
                ua."avatarUrl",
                ub.nickname,
                ub."avatarUrl"
            FROM streaks s
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE s.id = $2
              AND (s."userAId" = $1 OR s."userBId" = $1)
            "#,
        )
        .bind(user_id)
        .bind(streak_id)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                String,
                Option<String>,
            ),
        >(
            r#"
            SELECT
                s.id,
                s."userAId",
                s."userBId",
                ua.nickname,
                ua."avatarUrl",
                ub.nickname,
                ub."avatarUrl"
            FROM streaks s
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE (s."userAId" = $1 OR s."userBId" = $1)
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let mut partners = std::collections::HashMap::new();
    for (id, user_a_id, user_b_id, ua_nick, ua_avatar, ub_nick, ub_avatar) in rows {
        let partner = partner_of(
            &user_a_id,
            &user_b_id,
            &ua_nick,
            ua_avatar.as_deref(),
            &ub_nick,
            ub_avatar.as_deref(),
            user_id,
        );
        partners.insert(
            id,
            MemoryPartner {
                id: partner.id,
                nickname: partner.nickname,
                avatar_url: partner.avatar_url,
            },
        );
    }
    Ok(partners)
}

#[derive(Debug, sqlx::FromRow)]
struct PhotoProofDbRow {
    id: String,
    streak_day_id: String,
    uploaded_by_id: String,
    photo_url: String,
    photo_hash: String,
    latitude: Option<f64>,
    longitude: Option<f64>,
    liveness_ok: bool,
    faces_detected: i32,
    created_at: DateTime<Utc>,
    uploaded_by_nickname: String,
    user_a_id: String,
    user_a_nickname: String,
    user_b_id: String,
    user_b_nickname: String,
}

fn photo_proof_to_json(row: PhotoProofDbRow) -> serde_json::Value {
    serde_json::json!({
        "id": row.id,
        "streakDayId": row.streak_day_id,
        "uploadedById": row.uploaded_by_id,
        "photoUrl": row.photo_url,
        "photoHash": row.photo_hash,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "livenessOk": row.liveness_ok,
        "facesDetected": row.faces_detected,
        "matchScores": null,
        "createdAt": row.created_at.to_rfc3339(),
        "uploadedBy": {
            "id": row.uploaded_by_id,
            "nickname": row.uploaded_by_nickname,
        },
        "streakDay": {
            "streak": {
                "userA": { "id": row.user_a_id, "nickname": row.user_a_nickname },
                "userB": { "id": row.user_b_id, "nickname": row.user_b_nickname },
            }
        }
    })
}

async fn fetch_photo_proofs(
    pool: &PgPool,
    user_id: &str,
    mutual_with_user_id: Option<&str>,
    page: i32,
    limit: i32,
) -> Result<Vec<serde_json::Value>, ApiError> {
    let offset = ((page - 1) * limit) as i64;
    let limit = limit as i64;

    let rows = if let Some(partner_id) = mutual_with_user_id {
        sqlx::query_as::<_, PhotoProofDbRow>(
            r#"
            SELECT
                mp.id,
                mp."streakDayId" AS streak_day_id,
                mp."uploadedById" AS uploaded_by_id,
                mp."photoUrl" AS photo_url,
                mp."photoHash" AS photo_hash,
                mp.latitude,
                mp.longitude,
                mp."livenessOk" AS liveness_ok,
                mp."facesDetected" AS faces_detected,
                mp."createdAt" AS created_at,
                u.nickname AS uploaded_by_nickname,
                s."userAId" AS user_a_id,
                ua.nickname AS user_a_nickname,
                s."userBId" AS user_b_id,
                ub.nickname AS user_b_nickname
            FROM meet_proofs mp
            JOIN streak_days sd ON sd.id = mp."streakDayId"
            JOIN streaks s ON s.id = sd."streakId"
            JOIN users u ON u.id = mp."uploadedById"
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE (
                (s."userAId" = $1 AND s."userBId" = $2)
                OR (s."userAId" = $2 AND s."userBId" = $1)
            )
            ORDER BY mp."createdAt" DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(user_id)
        .bind(partner_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, PhotoProofDbRow>(
            r#"
            SELECT
                mp.id,
                mp."streakDayId" AS streak_day_id,
                mp."uploadedById" AS uploaded_by_id,
                mp."photoUrl" AS photo_url,
                mp."photoHash" AS photo_hash,
                mp.latitude,
                mp.longitude,
                mp."livenessOk" AS liveness_ok,
                mp."facesDetected" AS faces_detected,
                mp."createdAt" AS created_at,
                u.nickname AS uploaded_by_nickname,
                s."userAId" AS user_a_id,
                ua.nickname AS user_a_nickname,
                s."userBId" AS user_b_id,
                ub.nickname AS user_b_nickname
            FROM meet_proofs mp
            JOIN streak_days sd ON sd.id = mp."streakDayId"
            JOIN streaks s ON s.id = sd."streakId"
            JOIN users u ON u.id = mp."uploadedById"
            JOIN users ua ON ua.id = s."userAId"
            JOIN users ub ON ub.id = s."userBId"
            WHERE (s."userAId" = $1 OR s."userBId" = $1)
            ORDER BY mp."createdAt" DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows.into_iter().map(photo_proof_to_json).collect())
}

pub async fn list_for_user(
    pool: &PgPool,
    user_id: &str,
    page: i32,
    limit: i32,
    mutual_with_user_id: Option<&str>,
) -> Result<Vec<serde_json::Value>, ApiError> {
    fetch_photo_proofs(pool, user_id, mutual_with_user_id, page, limit).await
}

//! Remote selfie — parity with `backend/src/streaks/remoteSelfie.ts`.

use chrono::{DateTime, Utc};
use prost::Message;
use serde::Serialize;
use sqlx::PgPool;
use streakmeet_sync::{
    enqueue_outbox, remote_selfie_cleared_envelope, remote_selfie_pending_envelope,
    remote_selfie_pending_info, OutboxPublisher,
};
use streakmeet_types::{codes, ApiError};

use crate::calendar::remote_selfie_streak_day;
use crate::meet::{record_meet_for_streak, RecordMeetInput};
use crate::service::find_streak_for_user;

pub const REMOTE_SELFIE_TTL_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSelfieRequestJson {
    pub id: String,
    pub streak_id: String,
    pub sender_id: String,
    pub receiver_id: String,
    pub sender_photo_url: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSelfieReplyResultJson {
    pub success: bool,
    pub photo_url: String,
}

#[derive(Debug, sqlx::FromRow)]
struct RemoteSelfieRow {
    id: String,
    streak_id: String,
    sender_id: String,
    receiver_id: String,
    sender_photo_url: String,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
struct RemoteSelfieWithSenderRow {
    id: String,
    streak_id: String,
    sender_id: String,
    receiver_id: String,
    sender_photo_url: String,
    status: String,
    created_at: DateTime<Utc>,
    sender_nickname: String,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakUsersRow {
    id: String,
    timezone: String,
    user_a_id: String,
    user_b_id: String,
    user_a_nickname: String,
    user_a_avatar_url: Option<String>,
    user_b_nickname: String,
    user_b_avatar_url: Option<String>,
    count: i32,
    last_met_date: Option<String>,
}

fn row_to_json(row: RemoteSelfieRow) -> RemoteSelfieRequestJson {
    RemoteSelfieRequestJson {
        id: row.id,
        streak_id: row.streak_id,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        sender_photo_url: row.sender_photo_url,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub async fn expire_stale_remote_selfie_requests(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    streak_id: &str,
) -> Result<(), ApiError> {
    let cutoff = Utc::now() - chrono::Duration::milliseconds(REMOTE_SELFIE_TTL_MS);
    let stale = sqlx::query_as::<_, RemoteSelfieRow>(
        r#"
        UPDATE remote_selfie_requests
        SET status = 'EXPIRED', "updatedAt" = NOW()
        WHERE "streakId" = $1 AND status = 'PENDING' AND "createdAt" < $2
        RETURNING
            id, "streakId" AS streak_id, "senderId" AS sender_id,
            "receiverId" AS receiver_id, "senderPhotoUrl" AS sender_photo_url,
            status::text AS status, "createdAt" AS created_at, "updatedAt" AS updated_at
        "#,
    )
    .bind(streak_id)
    .bind(cutoff)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for row in stale {
        emit_remote_selfie_cleared(pool, publisher, &row.sender_id, streak_id, None).await?;
    }
    Ok(())
}

async fn emit_remote_selfie_cleared(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    actor_id: &str,
    streak_id: &str,
    meet: Option<streakmeet_proto::StreakMeetUpdated>,
) -> Result<(), ApiError> {
    let streak = sqlx::query_as::<_, StreakUsersRow>(
        r#"
        SELECT
            s.id, s.timezone, s."userAId" AS user_a_id, s."userBId" AS user_b_id,
            s.count, s."lastMetDate" AS last_met_date,
            ua.nickname AS user_a_nickname, ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname, ub."avatarUrl" AS user_b_avatar_url
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.id = $1
        "#,
    )
    .bind(streak_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some(streak) = streak else {
        return Ok(());
    };

    let envelope = remote_selfie_cleared_envelope(actor_id, streak_id, meet);
    let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
        enqueue_outbox(
            &mut tx,
            viewer_id,
            "streaks.remote_selfie_cleared",
            &envelope.event_id,
            &bytes,
        )
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    }
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
        if let Err(err) = publisher.publish_inline(viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %viewer_id, "remote selfie cleared publish failed");
        }
    }
    Ok(())
}

pub async fn init_remote_selfie(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    streak_id: &str,
    photo_base64: &str,
) -> Result<RemoteSelfieRequestJson, ApiError> {
    let streak = find_streak_for_user(pool, streak_id, user_id).await?;
    let partner_id = if streak.user_a_id == user_id {
        streak.user_b_id.clone()
    } else {
        streak.user_a_id.clone()
    };
    let sender_nickname = if streak.user_a_id == user_id {
        streak.user_a_nickname.clone()
    } else {
        streak.user_b_nickname.clone()
    };

    expire_stale_remote_selfie_requests(pool, publisher, &streak.id).await?;

    let existing = sqlx::query_as::<_, (String,)>(
        r#"
        SELECT id FROM remote_selfie_requests
        WHERE "streakId" = $1 AND status = 'PENDING'
        LIMIT 1
        "#,
    )
    .bind(&streak.id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if existing.is_some() {
        return Err(ApiError::new(409, codes::REMOTE_SELFIE_PENDING, None));
    }

    let saved_photo_url = streakmeet_media::save_base64_image_as_avif(
        photo_base64,
        &format!("remote_selfie_{}_{user_id}", Utc::now().timestamp_millis()),
    )
    .await
    .map_err(|_| ApiError::new(500, codes::IMAGE_SAVE_FAILED, None))?;

    let request_id = streakmeet_types::new_cuid()?;
    let row = sqlx::query_as::<_, RemoteSelfieRow>(
        r#"
        INSERT INTO remote_selfie_requests (
            id, "streakId", "senderId", "receiverId", "senderPhotoUrl", status
        )
        VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING
            id, "streakId" AS streak_id, "senderId" AS sender_id,
            "receiverId" AS receiver_id, "senderPhotoUrl" AS sender_photo_url,
            status::text AS status, "createdAt" AS created_at, "updatedAt" AS updated_at
        "#,
    )
    .bind(&request_id)
    .bind(&streak.id)
    .bind(user_id)
    .bind(&partner_id)
    .bind(&saved_photo_url)
    .fetch_one(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let pending = remote_selfie_pending_info(
        &row.id,
        user_id,
        &partner_id,
        &saved_photo_url,
        true,
        &sender_nickname,
    );
    let envelope = remote_selfie_pending_envelope(user_id, &streak.id, pending);
    let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    enqueue_outbox(
        &mut tx,
        &partner_id,
        "streaks.remote_selfie_pending",
        &envelope.event_id,
        &bytes,
    )
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if let Err(err) = publisher.publish_inline(&partner_id, &envelope).await {
        tracing::warn!(error = %err, recipient = %partner_id, "remote selfie pending publish failed");
    }

    Ok(row_to_json(row))
}

pub async fn reply_remote_selfie(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    streak_id: &str,
    request_id: &str,
    photo_base64: &str,
) -> Result<RemoteSelfieReplyResultJson, ApiError> {
    let request = sqlx::query_as::<_, RemoteSelfieWithSenderRow>(
        r#"
        SELECT
            r.id, r."streakId" AS streak_id, r."senderId" AS sender_id,
            r."receiverId" AS receiver_id, r."senderPhotoUrl" AS sender_photo_url,
            r.status::text AS status, r."createdAt" AS created_at,
            s.nickname AS sender_nickname
        FROM remote_selfie_requests r
        JOIN users s ON s.id = r."senderId"
        WHERE r.id = $1
        "#,
    )
    .bind(request_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::REMOTE_SELFIE_NOT_FOUND, None))?;

    if request.receiver_id != user_id || request.streak_id != streak_id {
        return Err(ApiError::new(404, codes::REMOTE_SELFIE_NOT_FOUND, None));
    }

    if request.status != "PENDING" {
        return Err(ApiError::new(400, codes::REMOTE_SELFIE_HANDLED, None));
    }

    let age_ms = (Utc::now() - request.created_at).num_milliseconds();
    if age_ms > REMOTE_SELFIE_TTL_MS {
        sqlx::query(
            r#"UPDATE remote_selfie_requests SET status = 'EXPIRED', "updatedAt" = NOW() WHERE id = $1"#,
        )
        .bind(request_id)
        .execute(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        emit_remote_selfie_cleared(pool, publisher, user_id, streak_id, None).await?;
        return Err(ApiError::new(410, codes::REMOTE_SELFIE_EXPIRED, None));
    }

    let claimed = sqlx::query(
        r#"
        UPDATE remote_selfie_requests
        SET status = 'COMPLETED', "updatedAt" = NOW()
        WHERE id = $1 AND "streakId" = $2 AND "receiverId" = $3 AND status = 'PENDING'
        "#,
    )
    .bind(request_id)
    .bind(streak_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if claimed.rows_affected() == 0 {
        return Err(ApiError::new(409, codes::REMOTE_SELFIE_HANDLED, None));
    }

    let streak = sqlx::query_as::<_, StreakUsersRow>(
        r#"
        SELECT
            s.id, s.timezone, s."userAId" AS user_a_id, s."userBId" AS user_b_id,
            s.count, s."lastMetDate" AS last_met_date,
            ua.nickname AS user_a_nickname, ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname, ub."avatarUrl" AS user_b_avatar_url
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.id = $1
        "#,
    )
    .bind(streak_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some(streak) = streak else {
        revert_claim(pool, request_id).await?;
        return Err(ApiError::new(404, codes::STREAK_NOT_FOUND, None));
    };

    let combined_url = match streakmeet_media::combine_remote_selfie_images(
        &request.sender_photo_url,
        photo_base64,
        &format!("combined_{}_{streak_id}", Utc::now().timestamp_millis()),
    )
    .await
    {
        Ok(url) => url,
        Err(err) => {
            tracing::error!(error = %err, "combine remote selfie failed");
            revert_claim(pool, request_id).await?;
            return Err(ApiError::new(500, codes::IMAGE_COMBINE_FAILED, None));
        }
    };

    let photo_hash = match streakmeet_media::hash_image_file(&combined_url).await {
        Ok(h) => h,
        Err(err) => {
            tracing::error!(error = %err, "hash combined image failed");
            revert_claim(pool, request_id).await?;
            return Err(ApiError::new(500, codes::IMAGE_SAVE_FAILED, None));
        }
    };

    let today = remote_selfie_streak_day(&streak.timezone, request.created_at);

    let meet_result = record_meet_for_streak(
        pool,
        publisher,
        RecordMeetInput {
            streak_id,
            calendar_date: &today,
            uploaded_by_id: user_id,
            photo_url: &combined_url,
            photo_hash: &photo_hash,
            latitude: None,
            longitude: None,
            match_scores: None,
            faces_detected: Some(2),
        },
    )
    .await?;

    let (partner_id, partner_nickname, partner_avatar) = if streak.user_a_id == user_id {
        (
            streak.user_b_id.as_str(),
            streak.user_b_nickname.as_str(),
            streak.user_b_avatar_url.as_deref(),
        )
    } else {
        (
            streak.user_a_id.as_str(),
            streak.user_a_nickname.as_str(),
            streak.user_a_avatar_url.as_deref(),
        )
    };

    let meet_envelope = if meet_result.extended {
        Some(streakmeet_proto::StreakMeetUpdated {
            streak_id: streak_id.to_string(),
            count: streak.count + 1,
            last_met_date: today.clone(),
            partner: Some(streakmeet_proto::UserSummary {
                id: partner_id.to_string(),
                nickname: partner_nickname.to_string(),
                avatar_url: partner_avatar.unwrap_or("").to_string(),
            }),
        })
    } else {
        None
    };

    emit_remote_selfie_cleared(pool, publisher, user_id, streak_id, meet_envelope).await?;

    Ok(RemoteSelfieReplyResultJson {
        success: true,
        photo_url: combined_url,
    })
}

async fn revert_claim(pool: &PgPool, request_id: &str) -> Result<(), ApiError> {
    sqlx::query(
        r#"UPDATE remote_selfie_requests SET status = 'PENDING', "updatedAt" = NOW() WHERE id = $1"#,
    )
    .bind(request_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(())
}

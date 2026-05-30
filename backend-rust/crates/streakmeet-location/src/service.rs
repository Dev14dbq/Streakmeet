use chrono::Utc;
use prost::Message;
use sqlx::PgPool;
use streakmeet_sync::{
    enqueue_outbox, location_removed_envelope, location_updated_envelope, OutboxPublisher,
};
use streakmeet_types::{codes, ApiError};

use crate::models::{FriendLocationJson, MyLocationJson};

#[derive(Debug, sqlx::FromRow)]
struct UserLocationRow {
    id: String,
    nickname: String,
    avatar_url: Option<String>,
    sharing_location: bool,
    last_latitude: Option<f64>,
    last_longitude: Option<f64>,
    last_location_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, sqlx::FromRow)]
struct FriendIdRow {
    partner_id: String,
}

fn me_payload(user: &UserLocationRow) -> MyLocationJson {
    MyLocationJson {
        sharing_location: user.sharing_location,
        latitude: user.last_latitude,
        longitude: user.last_longitude,
        updated_at: user.last_location_at.map(|t| t.to_rfc3339()),
    }
}

async fn get_accepted_friend_ids(pool: &PgPool, user_id: &str) -> Result<Vec<String>, ApiError> {
    let rows = sqlx::query_as::<_, FriendIdRow>(
        r#"
        SELECT
            CASE WHEN "userAId" = $1 THEN "userBId" ELSE "userAId" END AS partner_id
        FROM friendships
        WHERE status = 'ACCEPTED'
          AND ("userAId" = $1 OR "userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows.into_iter().map(|r| r.partner_id).collect())
}

async fn enqueue_location_to_friends(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    _actor_id: &str,
    friend_ids: &[String],
    event_type: &str,
    envelope: streakmeet_proto::SyncEnvelope,
) -> Result<Vec<streakmeet_proto::SyncEnvelope>, ApiError> {
    let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
    let mut copies = Vec::with_capacity(friend_ids.len());
    for friend_id in friend_ids {
        let mut copy = envelope.clone();
        copy.event_id = uuid::Uuid::new_v4().to_string();
        let copy_bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&copy);
        enqueue_outbox(tx, friend_id, event_type, &copy.event_id, &copy_bytes)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        copies.push(copy);
    }
    let _ = bytes;
    Ok(copies)
}

async fn publish_to_friends(
    publisher: &OutboxPublisher,
    friend_ids: &[String],
    envelopes: Vec<streakmeet_proto::SyncEnvelope>,
) {
    for (friend_id, envelope) in friend_ids.iter().zip(envelopes) {
        if let Err(err) = publisher.publish_inline(friend_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %friend_id, "inline location publish failed");
        }
    }
}

fn location_envelope_from_user(user: &UserLocationRow, actor_id: &str) -> streakmeet_proto::SyncEnvelope {
    location_updated_envelope(
        actor_id,
        &user.id,
        user.last_latitude.unwrap_or(0.0),
        user.last_longitude.unwrap_or(0.0),
        &user.nickname,
        user.avatar_url.as_deref(),
        &user.last_location_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
    )
}

pub async fn get_my_location(pool: &PgPool, user_id: &str) -> Result<MyLocationJson, ApiError> {
    let user = sqlx::query_as::<_, UserLocationRow>(
        r#"
        SELECT
            id, nickname, "avatarUrl" AS avatar_url,
            "sharingLocation" AS sharing_location,
            "lastLatitude" AS last_latitude,
            "lastLongitude" AS last_longitude,
            "lastLocationAt" AS last_location_at
        FROM users WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    Ok(me_payload(&user))
}

pub async fn get_friends_locations(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<FriendLocationJson>, ApiError> {
    let ids = get_accepted_friend_ids(pool, user_id).await?;
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let rows = sqlx::query_as::<_, UserLocationRow>(
        r#"
        SELECT
            id, nickname, "avatarUrl" AS avatar_url,
            "sharingLocation" AS sharing_location,
            "lastLatitude" AS last_latitude,
            "lastLongitude" AS last_longitude,
            "lastLocationAt" AS last_location_at
        FROM users
        WHERE id = ANY($1)
          AND "sharingLocation" = true
          AND "lastLatitude" IS NOT NULL
          AND "lastLongitude" IS NOT NULL
          AND "deletedAt" IS NULL
        ORDER BY nickname ASC
        "#,
    )
    .bind(&ids)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows
        .into_iter()
        .filter_map(|f| {
            Some(FriendLocationJson {
                id: f.id,
                nickname: f.nickname,
                avatar_url: f.avatar_url,
                latitude: f.last_latitude?,
                longitude: f.last_longitude?,
                updated_at: f.last_location_at?.to_rfc3339(),
            })
        })
        .collect())
}

pub async fn set_location_sharing(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    enabled: Option<bool>,
) -> Result<MyLocationJson, ApiError> {
    let enabled = enabled.ok_or_else(|| ApiError::new(400, codes::INVALID_BOOLEAN, None))?;

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let user = if enabled {
        sqlx::query_as::<_, UserLocationRow>(
            r#"
            UPDATE users SET "sharingLocation" = true
            WHERE id = $1
            RETURNING
                id, nickname, "avatarUrl" AS avatar_url,
                "sharingLocation" AS sharing_location,
                "lastLatitude" AS last_latitude,
                "lastLongitude" AS last_longitude,
                "lastLocationAt" AS last_location_at
            "#,
        )
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
    } else {
        sqlx::query_as::<_, UserLocationRow>(
            r#"
            UPDATE users SET
                "sharingLocation" = false,
                "lastLatitude" = NULL,
                "lastLongitude" = NULL,
                "lastLocationAt" = NULL
            WHERE id = $1
            RETURNING
                id, nickname, "avatarUrl" AS avatar_url,
                "sharingLocation" AS sharing_location,
                "lastLatitude" AS last_latitude,
                "lastLongitude" AS last_longitude,
                "lastLocationAt" AS last_location_at
            "#,
        )
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let friend_ids = get_accepted_friend_ids(pool, user_id).await?;
    let mut envelopes = Vec::new();

    if !enabled {
        let envelope = location_removed_envelope(user_id, user_id);
        envelopes = enqueue_location_to_friends(&mut tx, user_id, &friend_ids, "location.sharing_off", envelope).await?;
    } else if user.last_latitude.is_some()
        && user.last_longitude.is_some()
        && user.last_location_at.is_some()
    {
        let envelope = location_envelope_from_user(&user, user_id);
        envelopes = enqueue_location_to_friends(&mut tx, user_id, &friend_ids, "location.sharing_on", envelope).await?;
    }

    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    publish_to_friends(publisher, &friend_ids, envelopes).await;

    Ok(me_payload(&user))
}

pub async fn update_location(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<serde_json::Value, ApiError> {
    let (latitude, longitude) = match (latitude, longitude) {
        (Some(lat), Some(lng)) if lat.is_finite() && lng.is_finite() && (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lng) => {
            (lat, lng)
        }
        _ => return Err(ApiError::new(400, codes::INVALID_COORDINATES, None)),
    };

    let existing = sqlx::query_as::<_, UserLocationRow>(
        r#"
        SELECT
            id, nickname, "avatarUrl" AS avatar_url,
            "sharingLocation" AS sharing_location,
            "lastLatitude" AS last_latitude,
            "lastLongitude" AS last_longitude,
            "lastLocationAt" AS last_location_at
        FROM users WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    if !existing.sharing_location {
        return Err(ApiError::new(409, codes::LOCATION_SHARING_DISABLED, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let user = sqlx::query_as::<_, UserLocationRow>(
        r#"
        UPDATE users SET
            "lastLatitude" = $2,
            "lastLongitude" = $3,
            "lastLocationAt" = NOW()
        WHERE id = $1
        RETURNING
            id, nickname, "avatarUrl" AS avatar_url,
            "sharingLocation" AS sharing_location,
            "lastLatitude" AS last_latitude,
            "lastLongitude" AS last_longitude,
            "lastLocationAt" AS last_location_at
        "#,
    )
    .bind(user_id)
    .bind(latitude)
    .bind(longitude)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let friend_ids = get_accepted_friend_ids(pool, user_id).await?;
    let envelope = location_envelope_from_user(&user, user_id);
    let envelopes = enqueue_location_to_friends(&mut tx, user_id, &friend_ids, "location.updated", envelope).await?;

    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    publish_to_friends(publisher, &friend_ids, envelopes).await;

    Ok(serde_json::json!({
        "ok": true,
        "id": user.id,
        "nickname": user.nickname,
        "avatarUrl": user.avatar_url,
        "latitude": user.last_latitude,
        "longitude": user.last_longitude,
        "updatedAt": user.last_location_at.map(|t| t.to_rfc3339()),
    }))
}

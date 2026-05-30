use prost::Message;
use sqlx::PgPool;
use streakmeet_auth::UserRow;
use streakmeet_streaks::is_valid_timezone;
use streakmeet_sync::{enqueue_outbox, profile_updated_envelope, OutboxPublisher};
use streakmeet_types::{codes, ApiError};

use crate::models::{
    PublicFriendshipJson, PublicProfileJson, PublicUserJson, SearchUserJson, UpdateProfileInput,
    UserProfileJson,
};

fn is_valid_nickname(nickname: &str) -> bool {
    let n = nickname.to_lowercase();
    if n.len() < 3 || n.len() > 20 {
        return false;
    }
    n.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

async fn get_accepted_friend_ids(pool: &PgPool, user_id: &str) -> Result<Vec<String>, ApiError> {
    let rows = sqlx::query_as::<_, (String,)>(
        r#"
        SELECT CASE WHEN "userAId" = $1 THEN "userBId" ELSE "userAId" END
        FROM friendships
        WHERE status = 'ACCEPTED' AND ("userAId" = $1 OR "userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

async fn load_user_row(pool: &PgPool, user_id: &str) -> Result<UserRow, ApiError> {
    sqlx::query_as::<_, UserRow>(
        r#"
        SELECT
            id, email, "passwordHash", nickname, "qrCodeId", "gemsBalance",
            "faceEnrolled", "emailVerifiedAt", "avatarUrl", timezone,
            "isPublic", "notifyFriends", "notifyMeet", "geoOnPhotos", "deletedAt"
        FROM users WHERE id = $1 AND "deletedAt" IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))
}

fn to_profile_json(user: &UserRow) -> UserProfileJson {
    UserProfileJson::from(user)
}

async fn reconcile_streak_timezones(pool: &PgPool, user_id: &str) -> Result<(), ApiError> {
    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        r#"
        SELECT s.id, s.timezone, ua.timezone AS tz_a, ub.timezone AS tz_b
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.active = true AND (s."userAId" = $1 OR s."userBId" = $1)
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for (streak_id, current_tz, tz_a, tz_b) in rows {
        let next = streakmeet_streaks::generous_streak_timezone(
            Some(&tz_a),
            Some(&tz_b),
            chrono::Utc::now(),
        );
        if next != current_tz {
            let _ = sqlx::query(r#"UPDATE streaks SET timezone = $1 WHERE id = $2"#)
                .bind(&next)
                .bind(&streak_id)
                .execute(pool)
                .await;
        }
    }
    Ok(())
}

async fn notify_friends_profile_updated(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user: &UserRow,
) -> Result<(), ApiError> {
    let friend_ids = get_accepted_friend_ids(pool, &user.id).await?;
    if friend_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    let template = profile_updated_envelope(
        &user.id,
        &user.id,
        &user.nickname,
        user.avatar_url.as_deref(),
    );

    let mut envelopes = Vec::with_capacity(friend_ids.len());
    for friend_id in &friend_ids {
        let mut envelope = template.clone();
        envelope.event_id = uuid::Uuid::new_v4().to_string();
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(
            &mut tx,
            friend_id,
            "users.profile_updated",
            &envelope.event_id,
            &bytes,
        )
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        envelopes.push((friend_id.clone(), envelope));
    }

    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for (friend_id, envelope) in envelopes {
        if let Err(err) = publisher.publish_inline(&friend_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %friend_id, "inline profile publish failed");
        }
    }
    Ok(())
}

pub async fn get_profile(pool: &PgPool, user_id: &str) -> Result<UserProfileJson, ApiError> {
    let user = load_user_row(pool, user_id).await?;
    Ok(to_profile_json(&user))
}

pub async fn update_profile(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    input: UpdateProfileInput,
) -> Result<UserProfileJson, ApiError> {
    let mut user = load_user_row(pool, user_id).await?;
    let mut profile_changed = false;
    let mut timezone_changed = false;

    if let Some(nickname) = input.nickname {
        let normalized = nickname.to_lowercase();
        if !is_valid_nickname(&normalized) {
            return Err(ApiError::new(400, codes::INVALID_USERNAME, None));
        }
        if normalized != user.nickname {
            let taken = sqlx::query_as::<_, (i32,)>(
                r#"SELECT 1 FROM users WHERE nickname = $1 AND id != $2 LIMIT 1"#,
            )
            .bind(&normalized)
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
            if taken.is_some() {
                return Err(ApiError::new(409, codes::USERNAME_TAKEN, None));
            }
            user.nickname = normalized;
            profile_changed = true;
        }
    }

    if let Some(timezone) = input.timezone {
        if !is_valid_timezone(&timezone) {
            return Err(ApiError::new(400, codes::INVALID_TIMEZONE, None));
        }
        if timezone != user.timezone {
            user.timezone = timezone;
            timezone_changed = true;
        }
    }

    if let Some(is_public) = input.is_public {
        if is_public != user.is_public {
            user.is_public = is_public;
        }
    }

    if !profile_changed && !timezone_changed && input.is_public.is_none() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    user = sqlx::query_as::<_, UserRow>(
        r#"
        UPDATE users SET
            nickname = $2,
            timezone = $3,
            "isPublic" = $4
        WHERE id = $1
        RETURNING
            id, email, "passwordHash", nickname, "qrCodeId", "gemsBalance",
            "faceEnrolled", "emailVerifiedAt", "avatarUrl", timezone,
            "isPublic", "notifyFriends", "notifyMeet", "geoOnPhotos", "deletedAt"
        "#,
    )
    .bind(user_id)
    .bind(&user.nickname)
    .bind(&user.timezone)
    .bind(user.is_public)
    .fetch_one(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if timezone_changed {
        reconcile_streak_timezones(pool, user_id).await?;
    }

    if profile_changed {
        notify_friends_profile_updated(pool, publisher, &user).await?;
    }

    Ok(to_profile_json(&user))
}

pub async fn upload_avatar(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    photo_base64: Option<&str>,
) -> Result<serde_json::Value, ApiError> {
    let photo_base64 = photo_base64.filter(|s| !s.is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::INVALID_PHOTO, None)
    })?;

    if !photo_base64.starts_with("data:image/") {
        return Err(ApiError::new(400, codes::INVALID_PHOTO, None));
    }

    let avatar_url = streakmeet_media::save_base64_image_as_avif(
        photo_base64,
        &format!("avatar_{user_id}_{}", chrono::Utc::now().timestamp_millis()),
    )
    .await
    .map_err(|_| ApiError::new(500, codes::AVATAR_SAVE_FAILED, None))?;

    let user = sqlx::query_as::<_, UserRow>(
        r#"
        UPDATE users SET "avatarUrl" = $2 WHERE id = $1
        RETURNING
            id, email, "passwordHash", nickname, "qrCodeId", "gemsBalance",
            "faceEnrolled", "emailVerifiedAt", "avatarUrl", timezone,
            "isPublic", "notifyFriends", "notifyMeet", "geoOnPhotos", "deletedAt"
        "#,
    )
    .bind(user_id)
    .bind(&avatar_url)
    .fetch_one(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    notify_friends_profile_updated(pool, publisher, &user).await?;

    Ok(serde_json::json!({ "avatarUrl": avatar_url }))
}

pub async fn search_users(
    pool: &PgPool,
    user_id: &str,
    query: Option<&str>,
) -> Result<Vec<SearchUserJson>, ApiError> {
    let Some(query) = query.filter(|q| !q.trim().is_empty()) else {
        return Ok(vec![]);
    };
    let normalized = query.to_lowercase();

    let rows = sqlx::query_as::<_, (String, String, Option<String>, String)>(
        r#"
        SELECT id, nickname, "avatarUrl", "qrCodeId"
        FROM users
        WHERE "deletedAt" IS NULL
          AND id != $1
          AND (
            LOWER(nickname) LIKE '%' || $2 || '%'
            OR LOWER("qrCodeId") LIKE '%' || $2 || '%'
          )
        ORDER BY nickname ASC
        LIMIT 10
        "#,
    )
    .bind(user_id)
    .bind(&normalized)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows
        .into_iter()
        .map(|(id, nickname, avatar_url, qr_code_id)| SearchUserJson {
            id,
            nickname,
            avatar_url,
            qr_code_id,
        })
        .collect())
}

pub async fn get_public_profile(
    pool: &PgPool,
    viewer_id: Option<&str>,
    nickname: &str,
) -> Result<PublicProfileJson, ApiError> {
    let normalized = nickname.to_lowercase();
    if !is_valid_nickname(&normalized) {
        return Err(ApiError::new(404, codes::USER_NOT_FOUND, None));
    }

    let user = sqlx::query_as::<_, (String, String, Option<String>, bool)>(
        r#"
        SELECT id, nickname, "avatarUrl", "isPublic"
        FROM users
        WHERE nickname = $1 AND "deletedAt" IS NULL
        LIMIT 1
        "#,
    )
    .bind(&normalized)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    let friendship = if let Some(viewer_id) = viewer_id {
        if viewer_id == user.0 {
            Some(PublicFriendshipJson {
                id: String::new(),
                status: "SELF".into(),
                is_incoming: false,
            })
        } else {
            let row = sqlx::query_as::<_, (String, String, String)>(
                r#"
                SELECT id, status::text, "userBId"
                FROM friendships
                WHERE ("userAId" = $1 AND "userBId" = $2) OR ("userAId" = $2 AND "userBId" = $1)
                LIMIT 1
                "#,
            )
            .bind(viewer_id)
            .bind(&user.0)
            .fetch_optional(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

            row.map(|(id, status, user_b_id)| PublicFriendshipJson {
                id,
                status: status.clone(),
                is_incoming: user_b_id == viewer_id && status == "PENDING",
            })
        }
    } else {
        None
    };

    Ok(PublicProfileJson {
        user: PublicUserJson {
            id: user.0,
            nickname: user.1,
            avatar_url: user.2,
            is_public: user.3,
        },
        friendship,
    })
}
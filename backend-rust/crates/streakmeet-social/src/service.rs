use prost::Message;
use sqlx::PgPool;
use streakmeet_proto::{FriendListItem, FriendshipRecord, ListFriendsResponse};
use streakmeet_sync::{enqueue_outbox, friend_event_envelope, friend_list_item_proto, OutboxPublisher};
use streakmeet_types::{codes, ApiError};

use crate::models::{FriendListItemJson, FriendshipRecordJson, UserSummaryJson};

#[derive(Debug, sqlx::FromRow)]
struct FriendshipRow {
    id: String,
    user_a_id: String,
    user_b_id: String,
    status: String,
}

#[derive(Debug, sqlx::FromRow)]
struct FriendshipWithUsersRow {
    id: String,
    user_a_id: String,
    user_b_id: String,
    status: String,
    user_a_nickname: String,
    user_a_avatar_url: Option<String>,
    user_b_nickname: String,
    user_b_avatar_url: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct UserIdRow {
    id: String,
}

fn to_list_item(row: &FriendshipWithUsersRow, viewer_id: &str) -> FriendListItemJson {
    let is_user_a = row.user_a_id == viewer_id;
    let (friend_id, nickname, avatar_url) = if is_user_a {
        (
            row.user_b_id.clone(),
            row.user_b_nickname.clone(),
            row.user_b_avatar_url.clone(),
        )
    } else {
        (
            row.user_a_id.clone(),
            row.user_a_nickname.clone(),
            row.user_a_avatar_url.clone(),
        )
    };
    FriendListItemJson {
        id: row.id.clone(),
        status: row.status.clone(),
        is_incoming_request: !is_user_a && row.status == "PENDING",
        friend: UserSummaryJson {
            id: friend_id,
            nickname,
            avatar_url,
        },
    }
}

fn to_proto_item(item: &FriendListItemJson) -> FriendListItem {
    friend_list_item_proto(
        &item.id,
        &item.status,
        item.is_incoming_request,
        &item.friend.id,
        &item.friend.nickname,
        item.friend.avatar_url.as_deref(),
    )
}

async fn enqueue_friend_events(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_id: &str,
    row: &FriendshipWithUsersRow,
    event_type: &str,
) -> Result<Vec<streakmeet_proto::SyncEnvelope>, ApiError> {
    let mut envelopes = Vec::with_capacity(2);
    for viewer_id in [&row.user_a_id, &row.user_b_id] {
        let item = to_list_item(row, viewer_id);
        let envelope = friend_event_envelope(actor_id, event_type, to_proto_item(&item));
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(tx, viewer_id, event_type, &envelope.event_id, &bytes)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        envelopes.push(envelope);
    }
    Ok(envelopes)
}

async fn publish_envelopes(
    publisher: &OutboxPublisher,
    row: &FriendshipWithUsersRow,
    envelopes: Vec<streakmeet_proto::SyncEnvelope>,
) -> Result<(), ApiError> {
    for (viewer_id, envelope) in [&row.user_a_id, &row.user_b_id].into_iter().zip(envelopes) {
        if let Err(err) = publisher.publish_inline(viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = viewer_id, "inline publish failed");
        }
    }
    Ok(())
}

pub async fn list_friends(pool: &PgPool, user_id: &str) -> Result<Vec<FriendListItemJson>, ApiError> {
    let rows = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f."userAId" = $1 OR f."userBId" = $1
        ORDER BY f."createdAt" DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows.iter().map(|r| to_list_item(r, user_id)).collect())
}

pub async fn request_friend(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    friend_id: Option<&str>,
) -> Result<FriendshipRecordJson, ApiError> {
    let friend_id = friend_id.filter(|s| !s.trim().is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::MISSING_FIELD, None)
    })?;

    if user_id == friend_id {
        return Err(ApiError::new(400, codes::CANNOT_ADD_SELF, None));
    }

    let friend = sqlx::query_as::<_, UserIdRow>(
        r#"
        SELECT id FROM users WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1
        "#,
    )
    .bind(friend_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    let existing = sqlx::query_as::<_, FriendshipRow>(
        r#"
        SELECT id, "userAId" AS user_a_id, "userBId" AS user_b_id, status::text AS status
        FROM friendships
        WHERE ("userAId" = $1 AND "userBId" = $2) OR ("userAId" = $2 AND "userBId" = $1)
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(friend_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if existing.is_some() {
        return Err(ApiError::new(400, codes::FRIENDSHIP_EXISTS, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let created = sqlx::query_as::<_, FriendshipRow>(
        r#"
        INSERT INTO friendships ("userAId", "userBId", status)
        VALUES ($1, $2, 'PENDING')
        RETURNING id, "userAId" AS user_a_id, "userBId" AS user_b_id, status::text AS status
        "#,
    )
    .bind(user_id)
    .bind(&friend.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let with_users = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f.id = $1
        "#,
    )
    .bind(&created.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_friend_events(&mut tx, user_id, &with_users, "friends.requested").await?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(FriendshipRecordJson {
        id: created.id,
        status: created.status,
        user_a_id: created.user_a_id,
        user_b_id: created.user_b_id,
    })
}

pub async fn accept_friend(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    friendship_id: Option<&str>,
) -> Result<FriendshipRecordJson, ApiError> {
    let friendship_id = friendship_id.filter(|s| !s.trim().is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::MISSING_FIELD, None)
    })?;

    let friendship = sqlx::query_as::<_, FriendshipRow>(
        r#"
        SELECT id, "userAId" AS user_a_id, "userBId" AS user_b_id, status::text AS status
        FROM friendships WHERE id = $1
        "#,
    )
    .bind(friendship_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None))?;

    if friendship.user_b_id != user_id {
        return Err(ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None));
    }
    if friendship.status != "PENDING" {
        return Err(ApiError::new(400, codes::FRIENDSHIP_NOT_PENDING, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let updated = sqlx::query_as::<_, FriendshipRow>(
        r#"
        UPDATE friendships SET status = 'ACCEPTED', "updatedAt" = NOW()
        WHERE id = $1
        RETURNING id, "userAId" AS user_a_id, "userBId" AS user_b_id, status::text AS status
        "#,
    )
    .bind(friendship_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let with_users = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f.id = $1
        "#,
    )
    .bind(&updated.id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_friend_events(&mut tx, user_id, &with_users, "friends.accepted").await?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(FriendshipRecordJson {
        id: updated.id,
        status: updated.status,
        user_a_id: updated.user_a_id,
        user_b_id: updated.user_b_id,
    })
}

pub async fn list_friends_proto(pool: &PgPool, user_id: &str) -> Result<ListFriendsResponse, ApiError> {
    let friends = list_friends(pool, user_id).await?;
    Ok(ListFriendsResponse {
        friends: friends.iter().map(|f| to_proto_item(f)).collect(),
    })
}

/// Reject incoming friend request — sync `friends.rejected` to both users.
pub async fn reject_friend(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    friendship_id: Option<&str>,
) -> Result<FriendshipRecordJson, ApiError> {
    let friendship_id = friendship_id.filter(|s| !s.trim().is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::MISSING_FIELD, None)
    })?;

    let with_users = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f.id = $1
        "#,
    )
    .bind(friendship_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None))?;

    if with_users.user_b_id != user_id || with_users.status != "PENDING" {
        return Err(ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(r#"DELETE FROM friendships WHERE id = $1"#)
        .bind(friendship_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_friend_events(&mut tx, user_id, &with_users, "friends.rejected").await?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(FriendshipRecordJson {
        id: with_users.id,
        status: "REJECTED".into(),
        user_a_id: with_users.user_a_id,
        user_b_id: with_users.user_b_id,
    })
}

/// Cancel outgoing friend request — sync `friends.cancelled` to both users.
pub async fn cancel_friend(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    friendship_id: Option<&str>,
) -> Result<FriendshipRecordJson, ApiError> {
    let friendship_id = friendship_id.filter(|s| !s.trim().is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::MISSING_FIELD, None)
    })?;

    let with_users = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f.id = $1
        "#,
    )
    .bind(friendship_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None))?;

    if with_users.user_a_id != user_id || with_users.status != "PENDING" {
        return Err(ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(r#"DELETE FROM friendships WHERE id = $1"#)
        .bind(friendship_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_friend_events(&mut tx, user_id, &with_users, "friends.cancelled").await?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(FriendshipRecordJson {
        id: with_users.id,
        status: "CANCELLED".into(),
        user_a_id: with_users.user_a_id,
        user_b_id: with_users.user_b_id,
    })
}

/// Unfriend an accepted friendship — sync `friends.removed` to both users.
pub async fn remove_friend(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    friendship_id: &str,
) -> Result<FriendshipRecordJson, ApiError> {
    let with_users = sqlx::query_as::<_, FriendshipWithUsersRow>(
        r#"
        SELECT
            f.id,
            f."userAId" AS user_a_id,
            f."userBId" AS user_b_id,
            f.status::text AS status,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM friendships f
        JOIN users ua ON ua.id = f."userAId"
        JOIN users ub ON ub.id = f."userBId"
        WHERE f.id = $1
        "#,
    )
    .bind(friendship_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None))?;

    if with_users.user_a_id != user_id && with_users.user_b_id != user_id {
        return Err(ApiError::new(404, codes::FRIENDSHIP_NOT_FOUND, None));
    }
    if with_users.status != "ACCEPTED" {
        return Err(ApiError::new(400, codes::FRIENDSHIP_NOT_PENDING, None));
    }

    let mut tx = pool.begin().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(r#"DELETE FROM friendships WHERE id = $1"#)
        .bind(friendship_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_friend_events(&mut tx, user_id, &with_users, "friends.removed").await?;
    tx.commit().await.map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(FriendshipRecordJson {
        id: with_users.id,
        status: "REMOVED".into(),
        user_a_id: with_users.user_a_id,
        user_b_id: with_users.user_b_id,
    })
}

pub fn friendship_record_proto(record: &FriendshipRecordJson) -> FriendshipRecord {
    FriendshipRecord {
        id: record.id.clone(),
        status: record.status.clone(),
        user_a_id: record.user_a_id.clone(),
        user_b_id: record.user_b_id.clone(),
    }
}

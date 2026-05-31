use chrono::Utc;
use prost::Message;
use sqlx::PgPool;
use streakmeet_proto::{ListStreaksResponse, StreakListItem, StreakRecord};
use streakmeet_sync::{
    OutboxPublisher, enqueue_outbox, notification_envelope, streak_created_envelope,
    streak_list_item_proto,
};
use streakmeet_types::{ApiError, codes};

use crate::core::calendar::{generous_streak_timezone, get_local_date_string, normalize_timezone};
use crate::core::helpers::partner_of;
use crate::models::{
    StreakDetailDayJson, StreakDetailJson, StreakListItemJson, StreakPartnerJson, StreakRecordJson,
};

#[derive(Debug, sqlx::FromRow)]
pub struct StreakRow {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub count: i32,
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub user_a_nickname: String,
    pub user_a_avatar_url: Option<String>,
    pub user_b_nickname: String,
    pub user_b_avatar_url: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakIdRow {
    id: String,
}

#[derive(Debug, sqlx::FromRow)]
struct UserIdRow {
    id: String,
}

#[derive(Debug, sqlx::FromRow)]
struct TimezoneRow {
    timezone: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakRemindRow {
    last_met_date: Option<String>,
    timezone: String,
}

#[derive(Debug, sqlx::FromRow)]
struct NicknameRow {
    nickname: String,
}

#[derive(Debug, sqlx::FromRow)]
struct StreakDayRow {
    id: String,
    date: String,
    status: String,
}

fn row_to_list_item(row: &StreakRow, viewer_id: &str) -> StreakListItemJson {
    StreakListItemJson {
        id: row.id.clone(),
        count: row.count,
        last_met_date: row.last_met_date.clone(),
        timezone: row.timezone.clone(),
        partner: partner_of(
            &row.user_a_id,
            &row.user_b_id,
            &row.user_a_nickname,
            row.user_a_avatar_url.as_deref(),
            &row.user_b_nickname,
            row.user_b_avatar_url.as_deref(),
            viewer_id,
        ),
    }
}

fn to_proto_item(item: &StreakListItemJson) -> StreakListItem {
    streak_list_item_proto(
        &item.id,
        item.count,
        item.last_met_date.as_deref(),
        &item.timezone,
        &item.partner.id,
        &item.partner.nickname,
        item.partner.avatar_url.as_deref(),
    )
}

async fn are_accepted_friends(
    pool: &PgPool,
    user_id: &str,
    partner_id: &str,
) -> Result<bool, ApiError> {
    let row: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT 1
        FROM friendships
        WHERE status = 'ACCEPTED'
          AND (
            ("userAId" = $1 AND "userBId" = $2)
            OR ("userAId" = $2 AND "userBId" = $1)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(partner_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(row.is_some())
}

async fn partner_timezones(
    pool: &PgPool,
    user_id: &str,
    partner_id: &str,
) -> Result<String, ApiError> {
    let self_tz = sqlx::query_as::<_, TimezoneRow>(r#"SELECT timezone FROM users WHERE id = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let partner_tz =
        sqlx::query_as::<_, TimezoneRow>(r#"SELECT timezone FROM users WHERE id = $1"#)
            .bind(partner_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let self_tz_str = self_tz.and_then(|r| r.timezone);
    let partner_tz_str = partner_tz.and_then(|r| r.timezone);
    Ok(generous_streak_timezone(
        self_tz_str.as_deref(),
        partner_tz_str.as_deref(),
        Utc::now(),
    ))
}

async fn enqueue_streak_created(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_id: &str,
    row: &StreakRow,
) -> Result<Vec<streakmeet_proto::SyncEnvelope>, ApiError> {
    let mut envelopes = Vec::with_capacity(2);
    for viewer_id in [&row.user_a_id, &row.user_b_id] {
        let item = row_to_list_item(row, viewer_id);
        let envelope = streak_created_envelope(actor_id, to_proto_item(&item));
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(tx, viewer_id, "streaks.created", &envelope.event_id, &bytes)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        envelopes.push(envelope);
    }
    Ok(envelopes)
}

async fn publish_envelopes(
    publisher: &OutboxPublisher,
    row: &StreakRow,
    envelopes: Vec<streakmeet_proto::SyncEnvelope>,
) -> Result<(), ApiError> {
    for (viewer_id, envelope) in [&row.user_a_id, &row.user_b_id].into_iter().zip(envelopes) {
        if let Err(err) = publisher.publish_inline(viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = viewer_id, "inline streak publish failed");
        }
    }
    Ok(())
}

const STREAK_LIST_SQL: &str = r#"
    SELECT
        s.id,
        s."userAId" AS user_a_id,
        s."userBId" AS user_b_id,
        s.count,
        s."lastMetDate" AS last_met_date,
        s.timezone,
        ua.nickname AS user_a_nickname,
        ua."avatarUrl" AS user_a_avatar_url,
        ub.nickname AS user_b_nickname,
        ub."avatarUrl" AS user_b_avatar_url
    FROM streaks s
    JOIN users ua ON ua.id = s."userAId"
    JOIN users ub ON ub.id = s."userBId"
"#;

pub async fn list_streaks(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<StreakListItemJson>, ApiError> {
    let sql = format!(
        r#"{STREAK_LIST_SQL}
        WHERE (s."userAId" = $1 OR s."userBId" = $1) AND s.active = true
        ORDER BY s."updatedAt" DESC
        "#
    );
    let rows = sqlx::query_as::<_, StreakRow>(&sql)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(rows.iter().map(|r| row_to_list_item(r, user_id)).collect())
}

pub async fn create_streak(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    partner_id: Option<&str>,
) -> Result<StreakRecordJson, ApiError> {
    let partner_id = partner_id
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;

    if user_id == partner_id {
        return Err(ApiError::new(400, codes::CANNOT_ADD_SELF, None));
    }

    let partner = sqlx::query_as::<_, UserIdRow>(
        r#"SELECT id FROM users WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1"#,
    )
    .bind(partner_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    if !are_accepted_friends(pool, user_id, &partner.id).await? {
        return Err(ApiError::new(400, codes::NOT_FRIENDS, None));
    }

    let existing = sqlx::query_as::<_, StreakIdRow>(
        r#"
        SELECT id FROM streaks
        WHERE active = true
          AND (
            ("userAId" = $1 AND "userBId" = $2)
            OR ("userAId" = $2 AND "userBId" = $1)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(partner_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    if existing.is_some() {
        return Err(ApiError::new(400, codes::STREAK_EXISTS, None));
    }

    let timezone = partner_timezones(pool, user_id, partner_id).await?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let created = sqlx::query_as::<_, StreakIdRow>(
        r#"
        INSERT INTO streaks ("userAId", "userBId", count, timezone, active, "updatedAt")
        VALUES ($1, $2, 0, $3, true, NOW())
        RETURNING id
        "#,
    )
    .bind(user_id)
    .bind(partner_id)
    .bind(&timezone)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let sql = format!(
        r#"{STREAK_LIST_SQL}
        WHERE s.id = $1
        "#
    );
    let with_users = sqlx::query_as::<_, StreakRow>(&sql)
        .bind(&created.id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let envelopes = enqueue_streak_created(&mut tx, user_id, &with_users).await?;
    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    publish_envelopes(publisher, &with_users, envelopes).await?;

    Ok(StreakRecordJson {
        id: with_users.id,
        user_a_id: with_users.user_a_id,
        user_b_id: with_users.user_b_id,
        count: with_users.count,
        last_met_date: with_users.last_met_date,
        active: true,
        timezone: with_users.timezone,
    })
}

pub async fn get_streak_detail(
    pool: &PgPool,
    user_id: &str,
    param: &str,
    page: i32,
    limit: i32,
) -> Result<StreakDetailJson, ApiError> {
    let page = page.max(1);
    let limit = limit.clamp(1, 30);
    let offset = (page - 1) * limit;

    let streak_id = if param.starts_with('c') && param.len() > 20 {
        Some(param.to_string())
    } else {
        let nickname = param.to_lowercase();
        let partner = sqlx::query_as::<_, UserIdRow>(
            r#"SELECT id FROM users WHERE nickname = $1 AND "deletedAt" IS NULL LIMIT 1"#,
        )
        .bind(&nickname)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

        let partner = partner.ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;

        let meta = sqlx::query_as::<_, StreakIdRow>(
            r#"
            SELECT id FROM streaks
            WHERE active = true
              AND (
                ("userAId" = $1 AND "userBId" = $2)
                OR ("userAId" = $2 AND "userBId" = $1)
              )
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .bind(&partner.id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

        meta.map(|m| m.id)
    };

    let streak_id = streak_id.ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;

    let sql = format!(
        r#"{STREAK_LIST_SQL}
        WHERE s.id = $1
        "#
    );
    let streak = sqlx::query_as::<_, StreakRow>(&sql)
        .bind(&streak_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
        .ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;

    if streak.user_a_id != user_id && streak.user_b_id != user_id {
        return Err(ApiError::new(404, codes::STREAK_NOT_FOUND, None));
    }

    let days = sqlx::query_as::<_, StreakDayRow>(
        r#"
        SELECT id, date, status::text AS status
        FROM streak_days
        WHERE "streakId" = $1
        ORDER BY date DESC
        OFFSET $2 LIMIT $3
        "#,
    )
    .bind(&streak_id)
    .bind(offset as i64)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(StreakDetailJson {
        id: streak.id,
        count: streak.count,
        last_met_date: streak.last_met_date,
        timezone: streak.timezone,
        user_a: StreakPartnerJson {
            id: streak.user_a_id.clone(),
            nickname: streak.user_a_nickname.clone(),
            avatar_url: streak.user_a_avatar_url.clone(),
        },
        user_b: StreakPartnerJson {
            id: streak.user_b_id.clone(),
            nickname: streak.user_b_nickname.clone(),
            avatar_url: streak.user_b_avatar_url.clone(),
        },
        streak_days: Some(
            days.into_iter()
                .map(|d| StreakDetailDayJson {
                    id: d.id,
                    date: d.date,
                    status: d.status,
                })
                .collect(),
        ),
    })
}

pub async fn list_streaks_proto(
    pool: &PgPool,
    user_id: &str,
) -> Result<ListStreaksResponse, ApiError> {
    let streaks = list_streaks(pool, user_id).await?;
    Ok(ListStreaksResponse {
        streaks: streaks.iter().map(to_proto_item).collect(),
    })
}

pub fn streak_record_proto(record: &StreakRecordJson) -> StreakRecord {
    StreakRecord {
        id: record.id.clone(),
        user_a_id: record.user_a_id.clone(),
        user_b_id: record.user_b_id.clone(),
        count: record.count,
        last_met_date: record.last_met_date.clone().unwrap_or_default(),
        active: record.active,
        timezone: record.timezone.clone(),
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StreakForUserRow {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub user_a_nickname: String,
    pub user_a_avatar_url: Option<String>,
    pub user_b_nickname: String,
    pub user_b_avatar_url: Option<String>,
}

pub async fn remind_partner(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    partner_nickname: &str,
) -> Result<serde_json::Value, ApiError> {
    let nickname = partner_nickname.to_lowercase();
    let partner = sqlx::query_as::<_, UserIdRow>(
        r#"SELECT id FROM users WHERE nickname = $1 AND "deletedAt" IS NULL LIMIT 1"#,
    )
    .bind(&nickname)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    let streak = sqlx::query_as::<_, StreakRemindRow>(
        r#"
        SELECT s."lastMetDate" AS last_met_date, s.timezone
        FROM streaks s
        WHERE s.active = true
          AND (
            (s."userAId" = $1 AND s."userBId" = $2)
            OR (s."userAId" = $2 AND s."userBId" = $1)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(&partner.id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;

    let sender = sqlx::query_as::<_, NicknameRow>(r#"SELECT nickname FROM users WHERE id = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
        .ok_or_else(|| ApiError::new(404, codes::USER_NOT_FOUND, None))?;

    let tz = normalize_timezone(Some(&streak.timezone), "UTC");
    let today = get_local_date_string(&tz, Utc::now());
    if streak.last_met_date.as_deref() == Some(today.as_str()) {
        return Err(ApiError::new(400, codes::STREAK_ALREADY_MET_TODAY, None));
    }

    let variant = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() % 5)
        .unwrap_or(0)) as i32;
    let route = format!("/streaks/{}", sender.nickname);
    let envelope = notification_envelope(
        user_id,
        "streak_remind",
        &[
            ("nickname", sender.nickname.as_str()),
            ("variant", &variant.to_string()),
        ],
        &route,
    );
    let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    enqueue_outbox(
        &mut tx,
        &partner.id,
        "notifications.streak_remind",
        &envelope.event_id,
        &bytes,
    )
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let _ = publisher.publish_inline(&partner.id, &envelope).await;

    Ok(serde_json::json!({ "ok": true }))
}

/// Loads an active streak and returns 404 if the user is not a participant.
pub async fn find_streak_for_user(
    pool: &PgPool,
    streak_id: &str,
    user_id: &str,
) -> Result<StreakForUserRow, ApiError> {
    let streak = sqlx::query_as::<_, StreakForUserRow>(
        r#"
        SELECT
            s.id,
            s."userAId" AS user_a_id,
            s."userBId" AS user_b_id,
            ua.nickname AS user_a_nickname,
            ua."avatarUrl" AS user_a_avatar_url,
            ub.nickname AS user_b_nickname,
            ub."avatarUrl" AS user_b_avatar_url
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.id = $1 AND s.active = true
        "#,
    )
    .bind(streak_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let streak = streak.ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;
    if streak.user_a_id != user_id && streak.user_b_id != user_id {
        return Err(ApiError::new(404, codes::STREAK_NOT_FOUND, None));
    }
    Ok(streak)
}

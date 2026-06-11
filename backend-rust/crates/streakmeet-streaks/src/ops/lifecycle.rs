//! Streak death, ad-restore (max 3/month), and restart after final death.

use chrono::Utc;
use prost::Message;
use sqlx::PgPool;
use streakmeet_sync::{OutboxPublisher, enqueue_outbox, streak_burned_envelope, streak_restored_envelope};
use streakmeet_types::{ApiError, codes, new_cuid};

use crate::core::calendar::{get_local_date_string, normalize_timezone};
use crate::ops::service::{StreakRow, STREAK_LIST_SQL, enqueue_streak_created, publish_envelopes};

pub const MAX_RESTORES_PER_MONTH: i32 = 3;

pub async fn ensure_streak_lifecycle_schema(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        DO $$ BEGIN
          CREATE TYPE "StreakLifecycle" AS ENUM ('ACTIVE', 'DEAD', 'DEAD_FINAL');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        ALTER TABLE streaks
          ADD COLUMN IF NOT EXISTS lifecycle "StreakLifecycle" NOT NULL DEFAULT 'ACTIVE',
          ADD COLUMN IF NOT EXISTS "countAtDeath" INTEGER,
          ADD COLUMN IF NOT EXISTS "restoresMonthKey" TEXT,
          ADD COLUMN IF NOT EXISTS "restoresUsedMonth" INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "diedAt" TIMESTAMP(3)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS streak_restores (
          id TEXT PRIMARY KEY,
          "streakId" TEXT NOT NULL REFERENCES streaks(id) ON DELETE CASCADE,
          "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS streak_restores_streak_month_idx
          ON streak_restores ("streakId", "createdAt")
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

fn month_key_for_timezone(tz: &str) -> String {
    let tz = normalize_timezone(Some(tz), "UTC");
    get_local_date_string(&tz, Utc::now())[..7].to_string()
}

pub fn restores_left(used: i32) -> i32 {
    (MAX_RESTORES_PER_MONTH - used).max(0)
}

#[derive(Debug, sqlx::FromRow)]
pub struct StreakLifecycleRow {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub count: i32,
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub lifecycle: String,
    pub count_at_death: Option<i32>,
    pub restores_month_key: Option<String>,
    pub restores_used_month: i32,
}

fn sync_month_counters(row: &StreakLifecycleRow) -> (String, i32) {
    let key = month_key_for_timezone(&row.timezone);
    if row.restores_month_key.as_deref() == Some(key.as_str()) {
        (key, row.restores_used_month)
    } else {
        (key, 0)
    }
}

pub async fn restore_streak_after_ad(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    partner_nickname: &str,
) -> Result<serde_json::Value, ApiError> {
    let nickname = partner_nickname.to_lowercase();
    let row = load_streak_for_pair(pool, user_id, &nickname).await?;

    if row.lifecycle != "DEAD" {
        return Err(ApiError::new(400, codes::STREAK_NOT_DEAD, None));
    }

    let (month_key, used) = sync_month_counters(&row);
    if used >= MAX_RESTORES_PER_MONTH {
        return Err(ApiError::new(400, codes::STREAK_RESTORE_LIMIT, None));
    }

    let restored_count = row.count_at_death.unwrap_or(0).max(0);
    let new_used = used + 1;
    let left = restores_left(new_used);

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(
        r#"
        UPDATE streaks
        SET lifecycle = 'ACTIVE',
            count = $2,
            "countAtDeath" = NULL,
            "diedAt" = NULL,
            "restoresMonthKey" = $3,
            "restoresUsedMonth" = $4,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&row.id)
    .bind(restored_count)
    .bind(&month_key)
    .bind(new_used)
    .execute(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let restore_id = new_cuid()?;
    sqlx::query(
        r#"
        INSERT INTO streak_restores (id, "streakId", "userId", "createdAt")
        VALUES ($1, $2, $3, NOW())
        "#,
    )
    .bind(&restore_id)
    .bind(&row.id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let last_met = row.last_met_date.clone().unwrap_or_default();
    let mut envelopes = Vec::with_capacity(2);
    for viewer_id in [&row.user_a_id, &row.user_b_id] {
        let envelope = streak_restored_envelope(
            user_id,
            &row.id,
            restored_count,
            &last_met,
            restores_left(new_used),
        );
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(
            &mut tx,
            viewer_id,
            "streaks.restored",
            &envelope.event_id,
            &bytes,
        )
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        envelopes.push((viewer_id.clone(), envelope));
    }

    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for (viewer_id, envelope) in envelopes {
        if let Err(err) = publisher.publish_inline(&viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %viewer_id, "streak restore publish failed");
        }
    }

    Ok(serde_json::json!({
        "ok": true,
        "count": restored_count,
        "lifecycle": "ACTIVE",
        "restoresLeft": left,
    }))
}

pub async fn restart_streak(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    partner_nickname: &str,
) -> Result<serde_json::Value, ApiError> {
    let nickname = partner_nickname.to_lowercase();
    let row = load_streak_for_pair(pool, user_id, &nickname).await?;

    if row.lifecycle != "DEAD_FINAL" {
        return Err(ApiError::new(400, codes::STREAK_NOT_DEAD, None));
    }

    sqlx::query(
        r#"
        UPDATE streaks
        SET lifecycle = 'ACTIVE',
            count = 0,
            "lastMetDate" = NULL,
            "countAtDeath" = NULL,
            "diedAt" = NULL,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&row.id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let sql = format!(
        r#"{STREAK_LIST_SQL}
        WHERE s.id = $1
        "#
    );
    let full = sqlx::query_as::<_, StreakRow>(&sql)
        .bind(&row.id)
        .fetch_one(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    let envelopes = enqueue_streak_created(&mut tx, user_id, &full).await?;
    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    publish_envelopes(publisher, &full, envelopes).await?;

    Ok(serde_json::json!({
        "ok": true,
        "count": 0,
        "lifecycle": "ACTIVE",
    }))
}

async fn load_streak_for_pair(
    pool: &PgPool,
    user_id: &str,
    partner_nickname: &str,
) -> Result<StreakLifecycleRow, ApiError> {
    let row = sqlx::query_as::<_, StreakLifecycleRow>(
        r#"
        SELECT
            s.id,
            s."userAId" AS user_a_id,
            s."userBId" AS user_b_id,
            s.count,
            s."lastMetDate" AS last_met_date,
            s.timezone,
            s.lifecycle::text AS lifecycle,
            s."countAtDeath" AS count_at_death,
            s."restoresMonthKey" AS restores_month_key,
            s."restoresUsedMonth" AS restores_used_month
        FROM streaks s
        JOIN users ua ON ua.id = s."userAId"
        JOIN users ub ON ub.id = s."userBId"
        WHERE s.active = true
          AND (
            (s."userAId" = $1 AND LOWER(ub.nickname) = $2)
            OR (s."userBId" = $1 AND LOWER(ua.nickname) = $2)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(partner_nickname)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?
    .ok_or_else(|| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;

    Ok(row)
}

/// Apply burn side-effects: DEAD (recoverable) or DEAD_FINAL when monthly restores exhausted.
pub async fn apply_streak_burn(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    streak: &StreakBurnInput,
) -> Result<(), anyhow::Error> {
    let (month_key, used) = {
        let key = month_key_for_timezone(&streak.timezone);
        if streak.restores_month_key.as_deref() == Some(key.as_str()) {
            (key, streak.restores_used_month)
        } else {
            (key, 0)
        }
    };

    let count_at_death = streak.count;
    let (lifecycle, restores_left_val) = if used >= MAX_RESTORES_PER_MONTH {
        ("DEAD_FINAL", 0)
    } else {
        ("DEAD", restores_left(used))
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE streaks
        SET count = 0,
            lifecycle = $2::"StreakLifecycle",
            "countAtDeath" = $3,
            "diedAt" = NOW(),
            "restoresMonthKey" = $4,
            "restoresUsedMonth" = $5,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&streak.id)
    .bind(lifecycle)
    .bind(count_at_death)
    .bind(&month_key)
    .bind(used)
    .execute(&mut *tx)
    .await?;

    let mut envelopes = Vec::with_capacity(2);
    for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
        let envelope = streak_burned_envelope(
            "system",
            &streak.id,
            0,
            lifecycle,
            count_at_death,
            restores_left_val,
        );
        let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
        enqueue_outbox(
            &mut tx,
            viewer_id,
            "streaks.burned",
            &envelope.event_id,
            &bytes,
        )
        .await?;
        envelopes.push((viewer_id.clone(), envelope));
    }
    tx.commit().await?;

    for (viewer_id, envelope) in envelopes {
        if let Err(err) = publisher.publish_inline(&viewer_id, &envelope).await {
            tracing::warn!(error = %err, recipient = %viewer_id, "streak burn publish failed");
        }
    }
    Ok(())
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StreakBurnInput {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub count: i32,
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub restores_month_key: Option<String>,
    pub restores_used_month: i32,
}

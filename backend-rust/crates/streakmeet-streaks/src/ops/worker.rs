//! Streak worker cron — parity with `backend/src/jobs/streakNotifications.ts`.

use chrono::Utc;
use prost::Message;
use sqlx::PgPool;
use streakmeet_sync::{
    OutboxPublisher, enqueue_outbox, notification_envelope, streak_burned_envelope,
};

use crate::core::calendar::{
    add_days_to_date_string, get_local_date_string, get_local_time_parts, normalize_timezone,
};
use crate::ops::service::StreakRow;

#[derive(Clone, Copy)]
enum NotifyKind {
    Streak1h,
    Streak30m,
}

impl NotifyKind {
    fn db_kind(self) -> &'static str {
        match self {
            Self::Streak1h => "STREAK_1H",
            Self::Streak30m => "STREAK_30M",
        }
    }

    fn notification_type(self) -> &'static str {
        match self {
            Self::Streak1h => "streak_1h",
            Self::Streak30m => "streak_30m",
        }
    }

    fn event_type(self) -> &'static str {
        match self {
            Self::Streak1h => "notifications.streak_1h",
            Self::Streak30m => "notifications.streak_30m",
        }
    }
}

/// Every ~5 min: burn streaks at local 00:05 when lastMetDate != yesterday.
pub async fn process_streak_burns(
    pool: &PgPool,
    publisher: &OutboxPublisher,
) -> Result<usize, anyhow::Error> {
    let rows = sqlx::query_as::<_, StreakRow>(
        r#"
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
        WHERE s.active = true AND s.count > 0
        "#,
    )
    .fetch_all(pool)
    .await?;

    let now = Utc::now();
    let mut burned = 0usize;

    for streak in rows {
        let tz = normalize_timezone(Some(&streak.timezone), "UTC");
        let (hour, minute) = get_local_time_parts(&tz, now);
        if hour != 0 || !(5..10).contains(&minute) {
            continue;
        }

        let today = get_local_date_string(&tz, now);
        let yesterday = add_days_to_date_string(&today, -1);
        if streak.last_met_date.as_deref() == Some(yesterday.as_str()) {
            continue;
        }

        let mut tx = pool.begin().await?;
        sqlx::query(r#"UPDATE streaks SET count = 0, "updatedAt" = NOW() WHERE id = $1"#)
            .bind(&streak.id)
            .execute(&mut *tx)
            .await?;

        let mut envelopes = Vec::with_capacity(2);
        for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
            let envelope = streak_burned_envelope("system", &streak.id, 0);
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
        burned += 1;
    }

    Ok(burned)
}

/// Every ~5 min: 1h / 30m streak warnings at local 23:00 and 23:30 when not met today.
pub async fn process_streak_warnings(
    pool: &PgPool,
    publisher: &OutboxPublisher,
) -> Result<usize, anyhow::Error> {
    let rows = sqlx::query_as::<_, StreakRow>(
        r#"
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
        WHERE s.active = true AND s.count > 0
        "#,
    )
    .fetch_all(pool)
    .await?;

    let now = Utc::now();
    let mut sent = 0usize;

    for streak in rows {
        let tz = normalize_timezone(Some(&streak.timezone), "UTC");
        let (hour, minute) = get_local_time_parts(&tz, now);
        let today = get_local_date_string(&tz, now);
        let met_today = streak.last_met_date.as_deref() == Some(today.as_str());

        let kind = if hour == 23 && minute < 5 && !met_today {
            Some(NotifyKind::Streak1h)
        } else if hour == 23 && (30..35).contains(&minute) && !met_today {
            Some(NotifyKind::Streak30m)
        } else {
            None
        };

        let Some(kind) = kind else {
            continue;
        };

        for (user_id, partner_nickname) in [
            (&streak.user_a_id, streak.user_b_nickname.as_str()),
            (&streak.user_b_id, streak.user_a_nickname.as_str()),
        ] {
            if send_streak_notification(
                pool,
                publisher,
                user_id,
                &streak.id,
                kind,
                &today,
                partner_nickname,
            )
            .await?
            {
                sent += 1;
            }
        }
    }

    Ok(sent)
}

async fn send_streak_notification(
    pool: &PgPool,
    publisher: &OutboxPublisher,
    user_id: &str,
    streak_id: &str,
    kind: NotifyKind,
    local_date: &str,
    partner_nickname: &str,
) -> Result<bool, anyhow::Error> {
    let log_id = cuid::cuid1().map_err(|e| anyhow::anyhow!(e))?;
    let inserted = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO streak_notification_logs (id, "userId", "streakId", kind, "localDate")
        VALUES ($1, $2, $3, $4::"StreakNotificationKind", $5)
        ON CONFLICT ("userId", "streakId", kind, "localDate") DO NOTHING
        RETURNING id
        "#,
    )
    .bind(&log_id)
    .bind(user_id)
    .bind(streak_id)
    .bind(kind.db_kind())
    .bind(local_date)
    .fetch_optional(pool)
    .await?;

    let Some(_) = inserted else {
        return Ok(false);
    };

    let route = format!("/streaks/{partner_nickname}");
    let envelope = notification_envelope(
        "system",
        kind.notification_type(),
        &[("partner", partner_nickname)],
        &route,
    );
    let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);

    let mut tx = pool.begin().await?;
    enqueue_outbox(
        &mut tx,
        user_id,
        kind.event_type(),
        &envelope.event_id,
        &bytes,
    )
    .await?;
    tx.commit().await?;

    if let Err(err) = publisher.publish_inline(user_id, &envelope).await {
        tracing::warn!(error = %err, recipient = %user_id, "streak warning publish failed");
    }

    Ok(true)
}

/// Expire PENDING remote selfie requests older than `REMOTE_SELFIE_TTL_MS`.
pub async fn process_remote_selfie_expiry(
    pool: &PgPool,
    publisher: &OutboxPublisher,
) -> Result<usize, anyhow::Error> {
    use crate::ops::remote_selfie::{REMOTE_SELFIE_TTL_MS, expire_stale_remote_selfie_requests};

    let cutoff = chrono::Utc::now() - chrono::Duration::milliseconds(REMOTE_SELFIE_TTL_MS);
    let rows = sqlx::query_as::<_, (String,)>(
        r#"
        SELECT DISTINCT "streakId" AS streak_id
        FROM remote_selfie_requests
        WHERE status = 'PENDING' AND "createdAt" < $1
        "#,
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    let mut expired = 0usize;
    for (streak_id,) in rows {
        expire_stale_remote_selfie_requests(pool, publisher, &streak_id)
            .await
            .map_err(|e| anyhow::anyhow!(e))?;
        expired += 1;
    }
    Ok(expired)
}

//! Streak burn cron — parity with `backend/src/jobs/streakNotifications.ts` (burn branch).

use chrono::Utc;
use prost::Message;
use sqlx::PgPool;
use streakmeet_sync::{enqueue_outbox, streak_burned_envelope, OutboxPublisher};

use crate::calendar::{add_days_to_date_string, get_local_date_string, get_local_time_parts, normalize_timezone};
use crate::service::StreakRow; // re-export row shape for burn query

/// Every ~5 min: burn streaks at local 00:05 when lastMetDate != yesterday.
pub async fn process_streak_burns(pool: &PgPool, publisher: &OutboxPublisher) -> Result<usize, anyhow::Error> {
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
        if hour != 0 || minute < 5 || minute >= 10 {
            continue;
        }

        let today = get_local_date_string(&tz, now);
        let yesterday = add_days_to_date_string(&today, -1);
        if streak.last_met_date.as_deref() == Some(yesterday.as_str()) {
            continue;
        }

        let mut tx = pool.begin().await?;
        sqlx::query(
            r#"UPDATE streaks SET count = 0, "updatedAt" = NOW() WHERE id = $1"#,
        )
        .bind(&streak.id)
        .execute(&mut *tx)
        .await?;

        let mut envelopes = Vec::with_capacity(2);
        for viewer_id in [&streak.user_a_id, &streak.user_b_id] {
            let envelope = streak_burned_envelope("system", &streak.id, 0);
            let bytes = streakmeet_proto::SyncEnvelope::encode_to_vec(&envelope);
            enqueue_outbox(&mut tx, viewer_id, "streaks.burned", &envelope.event_id, &bytes).await?;
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

/// Expire PENDING remote selfie requests older than `REMOTE_SELFIE_TTL_MS`.
pub async fn process_remote_selfie_expiry(
    pool: &PgPool,
    publisher: &OutboxPublisher,
) -> Result<usize, anyhow::Error> {
    use crate::remote_selfie::{expire_stale_remote_selfie_requests, REMOTE_SELFIE_TTL_MS};

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

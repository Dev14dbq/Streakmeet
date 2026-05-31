//! CatchUp: replay missed sync events from PostgreSQL outbox and JetStream.

use std::collections::HashSet;

use async_nats::Client;
use prost::Message;
use streakmeet_nats::catchup_user_from_jetstream;
use streakmeet_proto::SyncEnvelope;
use tracing::debug;

const CATCHUP_LIMIT: i64 = 500;

/// Load missed envelopes for a user after `last_event_id` (exclusive).
/// Primary source: `sync_outbox`. JetStream supplements gaps when the cursor
/// is ahead of the outbox window (e.g. live events not yet queryable).
pub async fn load_catchup(
    pool: &streakmeet_db::PgPool,
    nats: &Client,
    user_id: &str,
    last_event_id: &str,
) -> Result<Vec<SyncEnvelope>, sqlx::Error> {
    let outbox = load_catchup_outbox(pool, user_id, last_event_id).await?;
    debug!(
        user_id,
        last_event_id,
        outbox_count = outbox.len(),
        "CatchUp loaded from sync_outbox"
    );

    if outbox.len() >= CATCHUP_LIMIT as usize {
        return Ok(outbox);
    }

    let cursor = outbox
        .last()
        .map(|e| e.event_id.as_str())
        .unwrap_or(last_event_id);

    let remaining = CATCHUP_LIMIT as usize - outbox.len();
    match catchup_user_from_jetstream(nats, user_id, cursor, remaining).await {
        Ok(js_rows) => {
            if !js_rows.is_empty() {
                debug!(
                    user_id,
                    jetstream_count = js_rows.len(),
                    "CatchUp supplemented from JetStream"
                );
            }
            Ok(merge_deduped(outbox, js_rows))
        }
        Err(err) => {
            tracing::warn!(error = %err, user_id, "JetStream CatchUp supplement failed, using outbox only");
            Ok(outbox)
        }
    }
}

async fn load_catchup_outbox(
    pool: &streakmeet_db::PgPool,
    user_id: &str,
    last_event_id: &str,
) -> Result<Vec<SyncEnvelope>, sqlx::Error> {
    let rows: Vec<(Vec<u8>,)> = if last_event_id.is_empty() {
        sqlx::query_as(
            r#"
            SELECT envelope_bytes
            FROM sync_outbox
            WHERE recipient_user_id = $1
            ORDER BY created_at ASC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(CATCHUP_LIMIT)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT envelope_bytes
            FROM sync_outbox
            WHERE recipient_user_id = $1
              AND created_at > COALESCE(
                (SELECT created_at FROM sync_outbox WHERE event_id = $2 LIMIT 1),
                '1970-01-01'::timestamptz
              )
            ORDER BY created_at ASC
            LIMIT $3
            "#,
        )
        .bind(user_id)
        .bind(last_event_id)
        .bind(CATCHUP_LIMIT)
        .fetch_all(pool)
        .await?
    };

    Ok(rows
        .into_iter()
        .filter_map(|(bytes,)| SyncEnvelope::decode(bytes.as_slice()).ok())
        .collect())
}

fn merge_deduped(
    mut primary: Vec<SyncEnvelope>,
    supplemental: Vec<SyncEnvelope>,
) -> Vec<SyncEnvelope> {
    let mut seen: HashSet<String> = primary.iter().map(|e| e.event_id.clone()).collect();
    for envelope in supplemental {
        if seen.insert(envelope.event_id.clone()) {
            primary.push(envelope);
        }
    }
    primary
}

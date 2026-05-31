use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use async_nats::Client;
use prost::Message;
use sqlx::PgPool;
use streakmeet_nats::publish_sync_envelope;
use streakmeet_proto::SyncEnvelope;
use tokio::time;
use tracing::{debug, warn};

#[derive(Clone)]
pub struct OutboxPublisher {
    pool: PgPool,
    nats: Client,
}

impl OutboxPublisher {
    pub fn new(pool: PgPool, nats: Client) -> Self {
        Self { pool, nats }
    }

    pub async fn publish_envelope(
        &self,
        recipient_user_id: &str,
        event_type: &str,
        envelope: &SyncEnvelope,
    ) -> Result<()> {
        let bytes = SyncEnvelope::encode_to_vec(envelope);
        let mut tx = self.pool.begin().await?;
        enqueue_outbox(
            &mut tx,
            recipient_user_id,
            event_type,
            &envelope.event_id,
            &bytes,
        )
        .await?;
        tx.commit().await?;

        self.publish_inline(recipient_user_id, envelope).await
    }

    /// Publish to NATS and mark outbox row published (outbox row must already exist).
    pub async fn publish_inline(
        &self,
        recipient_user_id: &str,
        envelope: &SyncEnvelope,
    ) -> Result<()> {
        publish_sync_envelope(&self.nats, recipient_user_id, envelope).await?;
        mark_published(&self.pool, &envelope.event_id).await
    }
}

pub async fn enqueue_outbox(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    recipient_user_id: &str,
    event_type: &str,
    event_id: &str,
    envelope_bytes: &[u8],
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO sync_outbox (recipient_user_id, event_type, event_id, envelope_bytes)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(recipient_user_id)
    .bind(event_type)
    .bind(event_id)
    .bind(envelope_bytes)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn mark_published(pool: &PgPool, event_id: &str) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sync_outbox SET published_at = NOW() WHERE event_id = $1
        "#,
    )
    .bind(event_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn publish_pending_outbox(
    pool: &PgPool,
    nats: &Client,
    batch_size: i64,
) -> Result<usize> {
    let rows = sqlx::query_as::<_, OutboxRow>(
        r#"
        SELECT id, recipient_user_id, envelope_bytes
        FROM sync_outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
        "#,
    )
    .bind(batch_size)
    .fetch_all(pool)
    .await?;

    let mut published = 0usize;
    for row in rows {
        let envelope = match SyncEnvelope::decode(row.envelope_bytes.as_slice()) {
            Ok(v) => v,
            Err(err) => {
                warn!(id = %row.id, error = %err, "skipping invalid outbox envelope");
                increment_attempts(pool, &row.id).await?;
                continue;
            }
        };

        if publish_sync_envelope(nats, &row.recipient_user_id, &envelope)
            .await
            .is_err()
        {
            increment_attempts(pool, &row.id).await?;
            continue;
        }

        sqlx::query(
            r#"
            UPDATE sync_outbox SET published_at = NOW() WHERE id = $1
            "#,
        )
        .bind(row.id)
        .execute(pool)
        .await?;
        published += 1;
    }
    Ok(published)
}

async fn increment_attempts(pool: &PgPool, id: &uuid::Uuid) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sync_outbox SET attempts = attempts + 1 WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, sqlx::FromRow)]
struct OutboxRow {
    id: uuid::Uuid,
    recipient_user_id: String,
    envelope_bytes: Vec<u8>,
}

pub fn run_outbox_worker(pool: PgPool, nats: Client) {
    let publisher = Arc::new(OutboxPublisher::new(pool, nats));
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            match publish_pending_outbox(&publisher.pool, &publisher.nats, 50).await {
                Ok(count) if count > 0 => debug!(count, "outbox worker published events"),
                Ok(_) => {}
                Err(err) => warn!(error = %err, "outbox worker tick failed"),
            }
        }
    });
}

//! NATS JetStream publisher and consumer helpers for sync events.

use std::time::Duration;

use anyhow::{Context, Result};
use async_nats::header::HeaderValue;
use async_nats::jetstream::consumer::{AckPolicy, DeliverPolicy, pull};
use async_nats::jetstream::stream::{Config as StreamConfig, StorageType};
use async_nats::jetstream::{self, Context as JetStreamContext, consumer::PullConsumer};
use async_nats::{Client, HeaderMap};
use futures::StreamExt;
use prost::Message;
use streakmeet_proto::SyncEnvelope;
use tracing::{debug, info, warn};

pub const SYNC_USER_SUBJECT_PREFIX: &str = "sync.user.";
pub const SYNC_STREAM_NAME: &str = "SYNC_USER";
pub const SYNC_FANOUT_CONSUMER: &str = "sync-gateway-fanout";
pub const SYNC_EVENT_ID_HEADER: &str = "Sm-Event-Id";

const STREAM_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);

pub async fn connect_from_env() -> Result<Client> {
    let url = std::env::var("NATS_URL").unwrap_or_else(|_| "nats://127.0.0.1:4222".into());
    connect(&url).await
}

pub async fn connect(url: &str) -> Result<Client> {
    let client = async_nats::connect(url)
        .await
        .with_context(|| format!("failed to connect to NATS at {url}"))?;
    tracing::info!(%url, "connected to NATS");
    Ok(client)
}

pub fn jetstream(client: &Client) -> JetStreamContext {
    jetstream::new(client.clone())
}

pub fn sync_user_subject(user_id: &str) -> String {
    format!("{SYNC_USER_SUBJECT_PREFIX}{user_id}")
}

pub fn recipient_from_subject(subject: &str) -> Option<&str> {
    subject.strip_prefix(SYNC_USER_SUBJECT_PREFIX)
}

/// Ensure the JetStream stream for per-user sync subjects exists.
pub async fn ensure_sync_stream(js: &JetStreamContext) -> Result<jetstream::stream::Stream> {
    let stream = js
        .get_or_create_stream(StreamConfig {
            name: SYNC_STREAM_NAME.into(),
            subjects: vec![format!("{SYNC_USER_SUBJECT_PREFIX}>")],
            max_age: STREAM_MAX_AGE,
            storage: StorageType::File,
            ..Default::default()
        })
        .await
        .context("failed to ensure SYNC_USER JetStream stream")?;
    info!(stream = SYNC_STREAM_NAME, "JetStream sync stream ready");
    Ok(stream)
}

/// Durable pull consumer used by sync-gateway to fan out live events.
pub async fn ensure_fanout_consumer(stream: &jetstream::stream::Stream) -> Result<PullConsumer> {
    stream
        .get_or_create_consumer(
            SYNC_FANOUT_CONSUMER,
            pull::Config {
                durable_name: Some(SYNC_FANOUT_CONSUMER.into()),
                ack_policy: AckPolicy::Explicit,
                deliver_policy: DeliverPolicy::All,
                filter_subjects: vec![format!("{SYNC_USER_SUBJECT_PREFIX}>")],
                ..Default::default()
            },
        )
        .await
        .context("failed to ensure sync-gateway fan-out consumer")
}

/// Publish protobuf-encoded SyncEnvelope to `sync.user.{recipientUserId}` via JetStream.
pub async fn publish_sync_envelope(
    client: &Client,
    recipient_user_id: &str,
    envelope: &SyncEnvelope,
) -> Result<()> {
    let subject = sync_user_subject(recipient_user_id);
    let bytes = prost::Message::encode_to_vec(envelope);
    let js = jetstream(client);
    ensure_sync_stream(&js).await?;

    let mut headers = HeaderMap::new();
    headers.insert(
        SYNC_EVENT_ID_HEADER,
        HeaderValue::from(envelope.event_id.clone()),
    );

    js.publish_with_headers(subject.clone(), headers, bytes.into())
        .await
        .with_context(|| format!("JetStream publish failed for subject {subject}"))?
        .await
        .with_context(|| format!("JetStream publish ack failed for subject {subject}"))?;

    debug!(
        recipient = recipient_user_id,
        event_id = %envelope.event_id,
        "published sync envelope to JetStream"
    );
    Ok(())
}

/// Replay sync envelopes for one user from JetStream (CatchUp supplement).
pub async fn catchup_user_from_jetstream(
    client: &Client,
    user_id: &str,
    last_event_id: &str,
    limit: usize,
) -> Result<Vec<SyncEnvelope>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let js = jetstream(client);
    let stream = ensure_sync_stream(&js).await?;
    let filter = sync_user_subject(user_id);

    let consumer = stream
        .create_consumer(pull::Config {
            filter_subject: filter.clone(),
            deliver_policy: DeliverPolicy::All,
            ack_policy: AckPolicy::None,
            ..Default::default()
        })
        .await
        .with_context(|| format!("failed to create ephemeral CatchUp consumer for {filter}"))?;

    let mut past_cursor = last_event_id.is_empty();
    let mut envelopes = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut batch = consumer
        .fetch()
        .max_messages(limit.min(500))
        .expires(Duration::from_secs(2))
        .messages()
        .await
        .context("JetStream CatchUp fetch failed")?;

    while let Some(msg) = batch.next().await {
        let msg = msg.map_err(|e| anyhow::anyhow!("JetStream CatchUp message error: {e}"))?;
        let Some(recipient) = recipient_from_subject(msg.subject.as_str()) else {
            continue;
        };
        if recipient != user_id {
            continue;
        }

        let envelope = match decode_sync_envelope(&msg.payload) {
            Ok(v) => v,
            Err(err) => {
                log_decode_error(&err);
                continue;
            }
        };

        if !past_cursor {
            if envelope.event_id == last_event_id {
                past_cursor = true;
            }
            continue;
        }

        if seen.insert(envelope.event_id.clone()) {
            envelopes.push(envelope);
            if envelopes.len() >= limit {
                break;
            }
        }
    }

    Ok(envelopes)
}

pub fn decode_sync_envelope(bytes: &[u8]) -> Result<SyncEnvelope> {
    SyncEnvelope::decode(bytes).context("invalid SyncEnvelope protobuf")
}

pub fn log_decode_error(err: &anyhow::Error) {
    warn!(error = %err, "failed to decode NATS sync message");
}

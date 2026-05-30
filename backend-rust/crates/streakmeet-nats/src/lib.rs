//! NATS JetStream publisher for sync events.

use anyhow::{Context, Result};
use async_nats::Client;
use prost::Message;
use streakmeet_proto::SyncEnvelope;
use tracing::{debug, warn};

pub const SYNC_USER_SUBJECT_PREFIX: &str = "sync.user.";

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

pub fn sync_user_subject(user_id: &str) -> String {
    format!("{SYNC_USER_SUBJECT_PREFIX}{user_id}")
}

pub fn recipient_from_subject(subject: &str) -> Option<&str> {
    subject.strip_prefix(SYNC_USER_SUBJECT_PREFIX)
}

/// Publish protobuf-encoded SyncEnvelope to `sync.user.{recipientUserId}`.
pub async fn publish_sync_envelope(client: &Client, recipient_user_id: &str, envelope: &SyncEnvelope) -> Result<()> {
    let subject = sync_user_subject(recipient_user_id);
    let bytes = prost::Message::encode_to_vec(envelope);
    client
        .publish(subject.clone(), bytes.into())
        .await
        .with_context(|| format!("NATS publish failed for subject {subject}"))?;
    debug!(
        recipient = recipient_user_id,
        event_id = %envelope.event_id,
        "published sync envelope"
    );
    Ok(())
}

/// Subscribe to all user sync subjects (`sync.user.>`).
pub async fn subscribe_all_user_sync(client: &Client) -> Result<async_nats::Subscriber> {
    client
        .subscribe(format!("{SYNC_USER_SUBJECT_PREFIX}>"))
        .await
        .context("failed to subscribe to sync.user.>")
}

pub fn decode_sync_envelope(bytes: &[u8]) -> Result<SyncEnvelope> {
    SyncEnvelope::decode(bytes).context("invalid SyncEnvelope protobuf")
}

pub fn log_decode_error(err: &anyhow::Error) {
    warn!(error = %err, "failed to decode NATS sync message");
}

//! JetStream durable consumer — fans out `sync.user.>` to in-memory SyncHub.

use std::sync::Arc;
use std::time::Duration;

use async_nats::Client;
use futures::StreamExt;
use streakmeet_nats::{
    decode_sync_envelope, ensure_fanout_consumer, ensure_sync_stream, jetstream, log_decode_error,
    recipient_from_subject,
};
use tracing::{info, warn};

use crate::hub::SyncHub;

pub async fn run_nats_fanout(hub: Arc<SyncHub>, nats: Client) -> anyhow::Result<()> {
    let js = jetstream(&nats);
    let stream = ensure_sync_stream(&js).await?;
    let consumer = ensure_fanout_consumer(&stream).await?;
    info!(
        consumer = streakmeet_nats::SYNC_FANOUT_CONSUMER,
        "JetStream durable consumer listening on sync.user.>"
    );

    loop {
        let mut batch = match consumer
            .fetch()
            .max_messages(64)
            .expires(Duration::from_secs(30))
            .messages()
            .await
        {
            Ok(batch) => batch,
            Err(err) => {
                warn!(error = %err, "JetStream fetch failed, retrying");
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        let mut received = false;
        while let Some(msg) = batch.next().await {
            received = true;
            let msg = match msg {
                Ok(m) => m,
                Err(err) => {
                    warn!(error = %err, "JetStream message error");
                    continue;
                }
            };

            let Some(user_id) = recipient_from_subject(msg.subject.as_str()) else {
                warn!(subject = %msg.subject, "ignored JetStream subject");
                let _ = msg.ack().await;
                continue;
            };

            match decode_sync_envelope(&msg.payload) {
                Ok(envelope) => {
                    let event_id = envelope.event_id.clone();
                    let devices = hub.subscriber_count(user_id);
                    hub.publish(user_id, envelope);
                    if devices > 0 {
                        tracing::debug!(
                            user_id,
                            devices,
                            event_id = %event_id,
                            "fan-out to active sync streams"
                        );
                    }
                }
                Err(err) => log_decode_error(&err),
            }

            if let Err(err) = msg.ack().await {
                warn!(error = %err, "JetStream ack failed");
            }
        }

        if !received {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}

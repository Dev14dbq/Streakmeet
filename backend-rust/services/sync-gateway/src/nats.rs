//! NATS `sync.user.>` subscriber — fans out to in-memory SyncHub.

use std::sync::Arc;

use futures::StreamExt;
use streakmeet_nats::{decode_sync_envelope, log_decode_error, recipient_from_subject, subscribe_all_user_sync};
use tracing::{info, warn};

use crate::hub::SyncHub;

pub async fn run_nats_fanout(hub: Arc<SyncHub>, nats: async_nats::Client) -> anyhow::Result<()> {
    let mut sub = subscribe_all_user_sync(&nats).await?;
    info!("NATS subscriber listening on sync.user.>");

    while let Some(msg) = sub.next().await {
        let Some(user_id) = recipient_from_subject(&msg.subject) else {
            warn!(subject = %msg.subject, "ignored NATS subject");
            continue;
        };

        match decode_sync_envelope(&msg.payload) {
            Ok(envelope) => {
                hub.publish(user_id, envelope);
            }
            Err(err) => log_decode_error(&err),
        }
    }

    warn!("NATS subscription ended");
    Ok(())
}

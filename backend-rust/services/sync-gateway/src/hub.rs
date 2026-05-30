//! In-memory fan-out hub for active sync streams (multi-device per user).

use dashmap::DashMap;
use streakmeet_proto::SyncEnvelope;
use tokio::sync::broadcast;

const CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Default)]
pub struct SyncHub {
    channels: DashMap<String, broadcast::Sender<SyncEnvelope>>,
}

impl SyncHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn subscribe(&self, user_id: &str) -> broadcast::Receiver<SyncEnvelope> {
        self.channels
            .entry(user_id.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .subscribe()
    }

    pub fn publish(&self, user_id: &str, envelope: SyncEnvelope) {
        if let Some(tx) = self.channels.get(user_id) {
            let _ = tx.send(envelope);
        }
    }

    pub fn subscriber_count(&self, user_id: &str) -> usize {
        self.channels
            .get(user_id)
            .map(|tx| tx.receiver_count())
            .unwrap_or(0)
    }
}

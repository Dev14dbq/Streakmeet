//! Transactional outbox + NATS publish helpers for sync events.

mod outbox;

pub use outbox::{enqueue_outbox, publish_pending_outbox, run_outbox_worker, OutboxPublisher};

use chrono::Utc;
use prost_types::Timestamp;
use streakmeet_proto::{FriendEvent, FriendListItem, SyncEnvelope, UserSummary};
use uuid::Uuid;

pub fn new_sync_envelope(actor_id: &str, payload: streakmeet_proto::streakmeet::v1::sync_envelope::Payload) -> SyncEnvelope {
    SyncEnvelope {
        event_id: Uuid::new_v4().to_string(),
        sequence: 0,
        at: Some(Timestamp {
            seconds: Utc::now().timestamp(),
            nanos: 0,
        }),
        actor_id: actor_id.to_string(),
        payload: Some(payload),
    }
}

pub fn friend_event_envelope(
    actor_id: &str,
    event_type: &str,
    item: FriendListItem,
) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::FriendEvent(FriendEvent {
            event_type: event_type.to_string(),
            friendship: Some(item),
        }),
    )
}

pub fn friend_list_item_proto(
    id: &str,
    status: &str,
    is_incoming_request: bool,
    friend_id: &str,
    nickname: &str,
    avatar_url: Option<&str>,
) -> FriendListItem {
    FriendListItem {
        id: id.to_string(),
        status: status.to_string(),
        is_incoming_request,
        friend: Some(UserSummary {
            id: friend_id.to_string(),
            nickname: nickname.to_string(),
            avatar_url: avatar_url.unwrap_or("").to_string(),
        }),
    }
}

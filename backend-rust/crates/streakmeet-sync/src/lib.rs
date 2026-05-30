//! Transactional outbox + NATS publish helpers for sync events.

mod outbox;

pub use outbox::{enqueue_outbox, publish_pending_outbox, run_outbox_worker, OutboxPublisher};

use chrono::Utc;
use prost_types::Timestamp;
use streakmeet_proto::{
    FriendEvent, FriendListItem, LocationRemoved, LocationUpdated, ProfileUpdated, StreakBurned,
    StreakCreated, StreakListItem, StreakMeetUpdated, SyncEnvelope, UserSummary,
};
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

pub fn streak_list_item_proto(
    id: &str,
    count: i32,
    last_met_date: Option<&str>,
    timezone: &str,
    partner_id: &str,
    nickname: &str,
    avatar_url: Option<&str>,
) -> StreakListItem {
    StreakListItem {
        id: id.to_string(),
        count,
        last_met_date: last_met_date.unwrap_or("").to_string(),
        timezone: timezone.to_string(),
        partner: Some(UserSummary {
            id: partner_id.to_string(),
            nickname: nickname.to_string(),
            avatar_url: avatar_url.unwrap_or("").to_string(),
        }),
    }
}

pub fn streak_created_envelope(actor_id: &str, item: StreakListItem) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakCreated(StreakCreated {
            streak: Some(item),
        }),
    )
}

pub fn streak_burned_envelope(actor_id: &str, streak_id: &str, count: i32) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakBurned(StreakBurned {
            streak_id: streak_id.to_string(),
            count,
        }),
    )
}

pub fn location_updated_envelope(
    actor_id: &str,
    user_id: &str,
    lat: f64,
    lng: f64,
    nickname: &str,
    avatar_url: Option<&str>,
    updated_at: &str,
) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::Location(LocationUpdated {
            user_id: user_id.to_string(),
            lat,
            lng,
            nickname: nickname.to_string(),
            avatar_url: avatar_url.unwrap_or("").to_string(),
            updated_at: updated_at.to_string(),
        }),
    )
}

pub fn location_removed_envelope(actor_id: &str, user_id: &str) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::LocationRemoved(LocationRemoved {
            user_id: user_id.to_string(),
        }),
    )
}

pub fn profile_updated_envelope(
    actor_id: &str,
    user_id: &str,
    nickname: &str,
    avatar_url: Option<&str>,
) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::ProfileUpdated(ProfileUpdated {
            user_id: user_id.to_string(),
            nickname: nickname.to_string(),
            avatar_url: avatar_url.unwrap_or("").to_string(),
        }),
    )
}

pub fn streak_meet_envelope(
    actor_id: &str,
    streak_id: &str,
    count: i32,
    last_met_date: &str,
    partner_id: &str,
    partner_nickname: &str,
    partner_avatar_url: Option<&str>,
) -> SyncEnvelope {
    new_sync_envelope(
        actor_id,
        streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakMeet(StreakMeetUpdated {
            streak_id: streak_id.to_string(),
            count,
            last_met_date: last_met_date.to_string(),
            partner: Some(UserSummary {
                id: partner_id.to_string(),
                nickname: partner_nickname.to_string(),
                avatar_url: partner_avatar_url.unwrap_or("").to_string(),
            }),
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

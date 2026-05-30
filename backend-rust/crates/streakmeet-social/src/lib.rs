//! Friends domain logic — parity with `backend/src/friends/service.ts`.

mod models;
mod service;

pub use models::{FriendListItemJson, FriendshipRecordJson, UserSummaryJson};
pub use service::{
    accept_friend, cancel_friend, friendship_record_proto, list_friends, list_friends_proto,
    reject_friend, remove_friend, request_friend,
};

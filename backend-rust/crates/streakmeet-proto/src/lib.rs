//! Generated protobuf types for StreakMeet gRPC / Connect services.

pub mod streakmeet {
    pub mod v1 {
        tonic::include_proto!("streakmeet.v1");
    }
}

pub use streakmeet::v1::{
    auth_service_client, auth_service_server, social_service_client, social_service_server,
    sync_service_client, sync_service_server, AcceptFriendRequest, AckRequest, AckResponse,
    AuthUser, CatchUpRequest, FriendEvent, FriendListItem, FriendshipRecord, Heartbeat,
    ListFriendsRequest, ListFriendsResponse, LocationRemoved, LocationUpdated, LoginRequest,
    LoginResponse, Notification, RequestFriendRequest, StreakCreated, StreakMeetUpdated,
    SubscribeRequest, SyncEnvelope, UserSummary,
};

pub use auth_service_server::AuthService;
pub use social_service_server::SocialService;
pub use sync_service_server::SyncService;

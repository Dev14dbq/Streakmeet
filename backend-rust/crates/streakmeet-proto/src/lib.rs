//! Generated protobuf types for StreakMeet gRPC / Connect services.

pub mod streakmeet {
    pub mod v1 {
        tonic::include_proto!("streakmeet.v1");
    }
}

pub use streakmeet::v1::{
    AcceptFriendRequest, AckRequest, AckResponse, AuthUser, CatchUpRequest, CreateStreakRequest,
    FriendEvent, FriendListItem, FriendshipRecord, GetStreakDetailRequest, Heartbeat,
    ListFriendsRequest, ListFriendsResponse, ListStreaksRequest, ListStreaksResponse,
    LocationRemoved, LocationUpdated, LoginRequest, LoginResponse, Notification, ProfileUpdated,
    RemoteSelfieCleared, RemoteSelfiePending, RemoteSelfiePendingInfo, RequestFriendRequest,
    StreakBurned, StreakCreated, StreakDetailDay, StreakDetailResponse, StreakEvent,
    StreakListItem, StreakMeetUpdated, StreakPhotoAdded, StreakRecord, SubscribeRequest,
    SyncEnvelope, UserSummary, auth_service_client, auth_service_server, social_service_client,
    social_service_server, streaks_service_client, streaks_service_server, sync_service_client,
    sync_service_server,
};

pub use auth_service_server::AuthService;
pub use social_service_server::SocialService;
pub use streaks_service_server::StreaksService;
pub use sync_service_server::SyncService;

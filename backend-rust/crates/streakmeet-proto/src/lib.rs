//! Generated protobuf types for StreakMeet gRPC / Connect services.

pub mod streakmeet {
    pub mod v1 {
        tonic::include_proto!("streakmeet.v1");
    }
}

pub use streakmeet::v1::{
    auth_service_client, auth_service_server, sync_service_client, sync_service_server,
    AckRequest, AckResponse, AuthUser, CatchUpRequest, FriendsUpdated, Heartbeat,
    LocationRemoved, LocationUpdated, LoginRequest, LoginResponse, Notification, StreakCreated,
    StreakMeetUpdated, SubscribeRequest, SyncEnvelope,
};

pub use auth_service_server::AuthService;
pub use sync_service_server::SyncService;

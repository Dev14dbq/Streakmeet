use streakmeet_db::PgPool;
use streakmeet_proto::social_service_server::SocialService;
use streakmeet_proto::{
    AcceptFriendRequest, FriendshipRecord, ListFriendsRequest, ListFriendsResponse,
    RequestFriendRequest,
};
use streakmeet_social::{
    accept_friend, friendship_record_proto, list_friends_proto, request_friend,
};
use streakmeet_sync::OutboxPublisher;
use streakmeet_types::ApiError;
use tonic::{Request, Response, Status};

pub struct SocialGrpc {
    pub pool: PgPool,
    pub publisher: OutboxPublisher,
}

fn map_error(err: ApiError) -> Status {
    let body = serde_json::to_string(&err.body).unwrap_or_default();
    match err.status {
        400 => Status::invalid_argument(body),
        401 => Status::unauthenticated(body),
        403 => Status::permission_denied(body),
        404 => Status::not_found(body),
        _ => Status::internal(body),
    }
}

#[tonic::async_trait]
impl SocialService for SocialGrpc {
    async fn request_friend(
        &self,
        request: Request<RequestFriendRequest>,
    ) -> Result<Response<FriendshipRecord>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let friend_id = request.into_inner().friend_id;
        let record = request_friend(
            &self.pool,
            &self.publisher,
            &user_id,
            Some(friend_id.as_str()),
        )
        .await
        .map_err(map_error)?;
        Ok(Response::new(friendship_record_proto(&record)))
    }

    async fn accept_friend(
        &self,
        request: Request<AcceptFriendRequest>,
    ) -> Result<Response<FriendshipRecord>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let friendship_id = request.into_inner().friendship_id;
        let record = accept_friend(
            &self.pool,
            &self.publisher,
            &user_id,
            Some(friendship_id.as_str()),
        )
        .await
        .map_err(map_error)?;
        Ok(Response::new(friendship_record_proto(&record)))
    }

    async fn list_friends(
        &self,
        request: Request<ListFriendsRequest>,
    ) -> Result<Response<ListFriendsResponse>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let _ = request.into_inner();
        list_friends_proto(&self.pool, &user_id)
            .await
            .map(Response::new)
            .map_err(map_error)
    }
}

#[allow(clippy::result_large_err)]
fn user_id_from_metadata(metadata: &tonic::metadata::MetadataMap) -> Result<String, Status> {
    let token = metadata
        .get("authorization")
        .or_else(|| metadata.get("Authorization"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(|| Status::unauthenticated(r#"{"code":"UNAUTHORIZED"}"#))?;

    let config = streakmeet_auth::config_from_env();
    streakmeet_auth::verify_access_token(token, &config.jwt_secret)
        .map_err(|_| Status::unauthenticated(r#"{"code":"INVALID_TOKEN"}"#))
}

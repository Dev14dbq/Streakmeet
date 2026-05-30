use streakmeet_db::PgPool;
use streakmeet_proto::streaks_service_server::StreaksService;
use streakmeet_proto::{
    CreateStreakRequest, GetStreakDetailRequest, ListStreaksRequest, ListStreaksResponse,
    StreakDetailResponse, StreakRecord,
};
use streakmeet_streaks::{
    create_streak, get_streak_detail, list_streaks_proto, streak_record_proto,
};
use streakmeet_sync::OutboxPublisher;
use streakmeet_types::ApiError;
use tonic::{Request, Response, Status};

pub struct StreaksGrpc {
    pub pool: PgPool,
    pub publisher: OutboxPublisher,
}

fn map_error(err: ApiError) -> Status {
    let body = serde_json::to_string(&err.body).unwrap_or_default();
    match err.status {
        400 => Status::invalid_argument(body),
        401 => Status::unauthenticated(body),
        404 => Status::not_found(body),
        _ => Status::internal(body),
    }
}

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

#[tonic::async_trait]
impl StreaksService for StreaksGrpc {
    async fn list_streaks(
        &self,
        request: Request<ListStreaksRequest>,
    ) -> Result<Response<ListStreaksResponse>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let _ = request.into_inner();
        list_streaks_proto(&self.pool, &user_id)
            .await
            .map(Response::new)
            .map_err(map_error)
    }

    async fn create_streak(
        &self,
        request: Request<CreateStreakRequest>,
    ) -> Result<Response<StreakRecord>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let partner_id = request.into_inner().partner_id;
        let record = create_streak(
            &self.pool,
            &self.publisher,
            &user_id,
            Some(partner_id.as_str()),
        )
        .await
        .map_err(map_error)?;
        Ok(Response::new(streak_record_proto(&record)))
    }

    async fn get_streak_detail(
        &self,
        request: Request<GetStreakDetailRequest>,
    ) -> Result<Response<StreakDetailResponse>, Status> {
        let user_id = user_id_from_metadata(request.metadata())?;
        let inner = request.into_inner();
        let page = if inner.page == 0 { 1 } else { inner.page };
        let limit = if inner.limit == 0 { 10 } else { inner.limit };
        let detail = get_streak_detail(
            &self.pool,
            &user_id,
            &inner.partner_nickname,
            page,
            limit,
        )
        .await
        .map_err(map_error)?;

        Ok(Response::new(StreakDetailResponse {
            id: detail.id,
            count: detail.count,
            last_met_date: detail.last_met_date.unwrap_or_default(),
            timezone: detail.timezone,
            user_a: Some(streakmeet_proto::UserSummary {
                id: detail.user_a.id,
                nickname: detail.user_a.nickname,
                avatar_url: detail.user_a.avatar_url.unwrap_or_default(),
            }),
            user_b: Some(streakmeet_proto::UserSummary {
                id: detail.user_b.id,
                nickname: detail.user_b.nickname,
                avatar_url: detail.user_b.avatar_url.unwrap_or_default(),
            }),
            streak_days: detail
                .streak_days
                .unwrap_or_default()
                .into_iter()
                .map(|d| streakmeet_proto::StreakDetailDay {
                    id: d.id,
                    date: d.date,
                    status: d.status,
                })
                .collect(),
        }))
    }
}

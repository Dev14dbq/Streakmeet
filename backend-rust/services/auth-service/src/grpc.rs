use streakmeet_auth::{AuthConfig, login_proto};
use streakmeet_db::PgPool;
use streakmeet_proto::auth_service_server::AuthService;
use streakmeet_proto::{LoginRequest, LoginResponse};
use streakmeet_types::{ApiError, codes};
use tonic::{Request, Response, Status};

pub struct AuthGrpc {
    pub pool: PgPool,
    pub config: AuthConfig,
}

fn map_error(err: ApiError) -> Status {
    let body = serde_json::to_string(&err.body).unwrap_or_default();
    match err.status {
        400 => Status::invalid_argument(body),
        401 => Status::unauthenticated(body),
        403 => Status::permission_denied(body),
        _ => Status::internal(body),
    }
}

#[tonic::async_trait]
impl AuthService for AuthGrpc {
    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<LoginResponse>, Status> {
        let req = request.into_inner();
        if req.email.is_empty() || req.password.is_empty() {
            return Err(Status::invalid_argument(
                serde_json::json!({ "code": codes::MISSING_FIELD }).to_string(),
            ));
        }
        let timezone = if req.timezone.is_empty() {
            None
        } else {
            Some(req.timezone.as_str())
        };
        login_proto(
            &self.pool,
            &self.config,
            &req.email,
            &req.password,
            timezone,
        )
        .await
        .map(Response::new)
        .map_err(map_error)
    }
}

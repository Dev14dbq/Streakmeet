use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use streakmeet_auth::login as auth_login;
use streakmeet_types::ApiError;

use crate::AppState;

pub async fn health() -> &'static str {
    "ok"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginBody {
    pub email: Option<String>,
    pub password: Option<String>,
    pub timezone: Option<String>,
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<streakmeet_auth::AuthResponseJson>, (StatusCode, Json<serde_json::Value>)> {
    let email = body.email.as_deref().unwrap_or("");
    let password = body.password.as_deref().unwrap_or("");
    let timezone = body.timezone.as_deref();

    auth_login(&state.pool, &state.auth_config, email, password, timezone)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub fn api_error_response(err: ApiError) -> (StatusCode, Json<serde_json::Value>) {
    let status =
        StatusCode::from_u16(err.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = if let Some(extra) = err.body.extra {
        extra
    } else {
        serde_json::to_value(&err.body).unwrap()
    };
    (status, Json(body))
}

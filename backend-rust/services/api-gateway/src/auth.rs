//! JWT auth extractor for api-gateway routes.

use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    Json,
};
use streakmeet_auth::verify_access_token;
use streakmeet_types::codes;

use crate::AppState;

pub struct AuthUser {
    pub user_id: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| unauthorized(codes::UNAUTHORIZED))?;

        let token = auth
            .strip_prefix("Bearer ")
            .ok_or_else(|| unauthorized(codes::UNAUTHORIZED))?;

        let user_id = verify_access_token(token, &state.auth_config.jwt_secret)
            .map_err(|_| unauthorized(codes::INVALID_TOKEN))?;

        Ok(AuthUser { user_id })
    }
}

#[derive(Debug, sqlx::FromRow)]
struct EmailVerifiedRow {
    email_verified_at: Option<chrono::DateTime<chrono::Utc>>,
    password_hash: String,
}

pub async fn require_email_verified(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<AuthUser, (StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query_as::<_, EmailVerifiedRow>(
        r#"
        SELECT "emailVerifiedAt" AS email_verified_at, "passwordHash" AS password_hash
        FROM users WHERE id = $1
        "#,
    )
    .bind(&auth.user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| internal_error())?
    .ok_or_else(|| not_found(codes::USER_NOT_FOUND))?;

    let email_verified = row.email_verified_at.is_some() || row.password_hash.is_empty();
    if !email_verified {
        return Err((
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "code": codes::EMAIL_NOT_VERIFIED,
                "error": streakmeet_types::default_message(codes::EMAIL_NOT_VERIFIED),
            })),
        ));
    }

    Ok(auth)
}

fn unauthorized(code: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({
            "code": code,
            "error": streakmeet_types::default_message(code),
        })),
    )
}

fn not_found(code: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({
            "code": code,
            "error": streakmeet_types::default_message(code),
        })),
    )
}

fn internal_error() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({
            "code": codes::INTERNAL_ERROR,
            "error": streakmeet_types::default_message(codes::INTERNAL_ERROR),
        })),
    )
}

/// Optional JWT — for public routes that work with or without auth.
pub struct OptionalAuthUser {
    pub user_id: Option<String>,
}

impl FromRequestParts<AppState> for OptionalAuthUser {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok());

        let Some(auth) = auth else {
            return Ok(OptionalAuthUser { user_id: None });
        };

        let Some(token) = auth.strip_prefix("Bearer ") else {
            return Ok(OptionalAuthUser { user_id: None });
        };

        let user_id = verify_access_token(token, &state.auth_config.jwt_secret).ok();
        Ok(OptionalAuthUser { user_id })
    }
}

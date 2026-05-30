//! JWT auth extractor for api-gateway routes.

use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    Json,
};
use streakmeet_auth::{verify_auth_token, AuthTokenResult, DeletedAccountBody};
use streakmeet_types::codes;

use crate::AppState;

pub struct AuthUser {
    pub user_id: String,
    pub email_verified: bool,
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

        if token.is_empty() {
            return Err(unauthorized(codes::UNAUTHORIZED));
        }

        match verify_auth_token(&state.pool, token, &state.auth_config.jwt_secret).await {
            AuthTokenResult::Ok {
                user_id,
                email_verified,
            } => Ok(AuthUser {
                user_id,
                email_verified,
            }),
            AuthTokenResult::Invalid => Err(unauthorized(codes::INVALID_TOKEN)),
            AuthTokenResult::Deleted {
                email,
                deleted_at,
            } => Err(deleted_account(email, deleted_at)),
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct EmailVerifiedRow {
    email_verified_at: Option<chrono::NaiveDateTime>,
    password_hash: String,
}

pub async fn require_email_verified(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<AuthUser, (StatusCode, Json<serde_json::Value>)> {
    if auth.email_verified {
        return Ok(auth);
    }

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

    Ok(AuthUser {
        user_id: auth.user_id,
        email_verified: true,
    })
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

fn deleted_account(
    email: String,
    deleted_at: chrono::DateTime<chrono::Utc>,
) -> (StatusCode, Json<serde_json::Value>) {
    let retention_secs = streakmeet_auth::ACCOUNT_RETENTION_DAYS * 86_400;
    let elapsed = (chrono::Utc::now() - deleted_at).num_seconds();
    let days_remaining = ((retention_secs - elapsed).max(0) / 86_400) as i32;

    let body = DeletedAccountBody {
        error: "Аккаунт удалён — войдите, чтобы восстановить".into(),
        code: codes::ACCOUNT_DELETED.into(),
        email,
        deleted_at: deleted_at.to_rfc3339(),
        days_remaining,
    };
    (
        StatusCode::FORBIDDEN,
        Json(serde_json::to_value(body).unwrap()),
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

        if token.is_empty() {
            return Ok(OptionalAuthUser { user_id: None });
        }

        let user_id = match verify_auth_token(&state.pool, token, &state.auth_config.jwt_secret).await
        {
            AuthTokenResult::Ok { user_id, .. } => Some(user_id),
            _ => None,
        };
        Ok(OptionalAuthUser { user_id })
    }
}

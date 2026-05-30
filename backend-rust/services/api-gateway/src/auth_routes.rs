use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    Json,
};
use serde::Deserialize;

use streakmeet_auth::{
    apple_login, check_email, enroll_face, forgot_password, google_login, register,
    resend_verification, reset_password, restore_account, verify_email_and_get_redirect,
    verify_email_with_token, RegisterInput, RestoreAccountInput,
};

use crate::auth::{require_email_verified, AuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckEmailBody {
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterBody {
    pub email: Option<String>,
    pub password: Option<String>,
    pub nickname: Option<String>,
    pub username: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthGoogleBody {
    pub access_token: Option<String>,
    pub id_token: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthAppleBody {
    pub id_token: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreAccountBody {
    pub email: Option<String>,
    pub password: Option<String>,
    pub provider: Option<String>,
    pub access_token: Option<String>,
    pub id_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailPostBody {
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailQuery {
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgotPasswordBody {
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordBody {
    pub token: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollFaceBody {
    pub photos: Option<Vec<String>>,
}

pub async fn check_email_handler(
    State(state): State<AppState>,
    Json(body): Json<CheckEmailBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    check_email(&state.pool, body.email.as_deref().unwrap_or(""))
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn register_handler(
    State(state): State<AppState>,
    Json(body): Json<RegisterBody>,
) -> Result<(StatusCode, Json<streakmeet_auth::AuthResponseJson>), (StatusCode, Json<serde_json::Value>)> {
    let username = body
        .username
        .as_deref()
        .or(body.nickname.as_deref());
    register(
        &state.pool,
        &state.auth_config,
        RegisterInput {
            email: body.email.as_deref(),
            password: body.password.as_deref(),
            username,
            timezone: body.timezone.as_deref(),
        },
    )
    .await
    .map(|r| (StatusCode::CREATED, Json(r)))
    .map_err(api_error_response)
}

pub async fn google_login_handler(
    State(state): State<AppState>,
    Json(body): Json<OAuthGoogleBody>,
) -> Result<Json<streakmeet_auth::AuthResponseJson>, (StatusCode, Json<serde_json::Value>)> {
    google_login(
        &state.pool,
        &state.auth_config,
        body.access_token.as_deref(),
        body.id_token.as_deref(),
        body.timezone.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn apple_login_handler(
    State(state): State<AppState>,
    Json(body): Json<OAuthAppleBody>,
) -> Result<Json<streakmeet_auth::AuthResponseJson>, (StatusCode, Json<serde_json::Value>)> {
    apple_login(
        &state.pool,
        &state.auth_config,
        body.id_token.as_deref(),
        body.timezone.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn restore_account_handler(
    State(state): State<AppState>,
    Json(body): Json<RestoreAccountBody>,
) -> Result<Json<streakmeet_auth::AuthResponseJson>, (StatusCode, Json<serde_json::Value>)> {
    restore_account(
        &state.pool,
        &state.auth_config,
        RestoreAccountInput {
            email: body.email.as_deref(),
            password: body.password.as_deref(),
            provider: body.provider.as_deref(),
            access_token: body.access_token.as_deref(),
            id_token: body.id_token.as_deref(),
        },
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn verify_email_post_handler(
    State(state): State<AppState>,
    Json(body): Json<VerifyEmailPostBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let token = body.token.as_deref().filter(|t| !t.is_empty()).ok_or_else(|| {
        api_error_response(streakmeet_types::ApiError::new(
            400,
            streakmeet_types::codes::MISSING_FIELD,
            None,
        ))
    })?;
    verify_email_with_token(&state.pool, token)
        .await
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(api_error_response)
}

pub async fn verify_email_get_handler(
    State(state): State<AppState>,
    Query(query): Query<VerifyEmailQuery>,
) -> impl IntoResponse {
    let token = query.token.as_deref().unwrap_or("");
    let redirect = verify_email_and_get_redirect(&state.pool, token).await;
    Redirect::temporary(&redirect)
}

pub async fn resend_verification_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    resend_verification(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn forgot_password_handler(
    State(state): State<AppState>,
    Json(body): Json<ForgotPasswordBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    forgot_password(&state.pool, body.email.as_deref().unwrap_or(""))
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn reset_password_handler(
    State(state): State<AppState>,
    Json(body): Json<ResetPasswordBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    reset_password(
        &state.pool,
        body.token.as_deref(),
        body.password.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn enroll_face_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<EnrollFaceBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    let photos = body.photos.unwrap_or_default();
    enroll_face(&state.pool, &auth.user_id, &photos)
        .await
        .map(|r| {
            Json(serde_json::json!({
                "success": r.success,
                "accepted": r.accepted,
                "total": r.total,
            }))
        })
        .map_err(api_error_response)
}

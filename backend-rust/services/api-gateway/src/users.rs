use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use streakmeet_users::{
    get_profile, get_public_photos, get_public_profile, list_photos, search_users, update_email,
    update_password, update_preferences, update_profile, update_settings, upload_avatar,
    UpdateProfileInput,
};

use crate::auth::{require_email_verified, AuthUser, OptionalAuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvatarBody {
    pub photo_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBody {
    pub timezone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesBody {
    pub notify_friends: Option<bool>,
    pub notify_meet: Option<bool>,
    pub geo_on_photos: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailBody {
    pub email: Option<String>,
    pub current_password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordBody {
    pub current_password: Option<String>,
    pub new_password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<String>,
    pub limit: Option<String>,
}

pub async fn get_me_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<streakmeet_auth::AuthUserJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    get_profile(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn patch_me_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateProfileInput>,
) -> Result<Json<streakmeet_auth::AuthUserJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_profile(&state.pool, &state.outbox, &auth.user_id, body)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn upload_avatar_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<AvatarBody>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    upload_avatar(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.photo_base64.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn search_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<streakmeet_users::SearchUserJson>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    search_users(&state.pool, &auth.user_id, query.q.as_deref())
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn public_profile_handler(
    State(state): State<AppState>,
    auth: OptionalAuthUser,
    axum::extract::Path(nickname): axum::extract::Path<String>,
) -> Result<Json<streakmeet_users::PublicProfileJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let viewer_id = auth.user_id.as_deref();
    get_public_profile(&state.pool, viewer_id, &nickname)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn patch_settings_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SettingsBody>,
) -> Result<Json<streakmeet_auth::AuthUserJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_settings(&state.pool, &auth.user_id, body.timezone.as_deref())
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn patch_preferences_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PreferencesBody>,
) -> Result<Json<streakmeet_auth::AuthUserJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_preferences(
        &state.pool,
        &auth.user_id,
        body.notify_friends,
        body.notify_meet,
        body.geo_on_photos,
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn patch_email_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<EmailBody>,
) -> Result<Json<streakmeet_auth::AuthUserJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_email(
        &state.pool,
        &auth.user_id,
        body.email.as_deref(),
        body.current_password.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn patch_password_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<PasswordBody>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_password(
        &state.pool,
        &auth.user_id,
        body.current_password.as_deref(),
        body.new_password.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn list_photos_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<serde_json::Value>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    let (page, limit) =
        streakmeet_types::parse_pagination(query.page.as_deref(), query.limit.as_deref(), 1, 12, 50);
    list_photos(&state.pool, &auth.user_id, page, limit)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn public_photos_handler(
    State(state): State<AppState>,
    auth: OptionalAuthUser,
    axum::extract::Path(nickname): axum::extract::Path<String>,
    Query(query): Query<PaginationQuery>,
) -> Result<Json<Vec<serde_json::Value>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let (page, limit) =
        streakmeet_types::parse_pagination(query.page.as_deref(), query.limit.as_deref(), 1, 12, 50);
    get_public_photos(
        &state.pool,
        auth.user_id.as_deref(),
        &nickname,
        page,
        limit,
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn delete_me_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    streakmeet_users::delete_account(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

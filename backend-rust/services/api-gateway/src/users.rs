use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use streakmeet_users::{
    get_profile, get_public_profile, search_users, update_profile, upload_avatar, UpdateProfileInput,
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

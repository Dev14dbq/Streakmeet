use axum::{extract::{Path, State}, Json};
use serde::Deserialize;
use streakmeet_social::{accept_friend, cancel_friend, list_friends, reject_friend, remove_friend, request_friend};

use crate::auth::{require_email_verified, AuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFriendBody {
    pub friend_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptFriendBody {
    pub friendship_id: Option<String>,
}

pub async fn list_friends_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<streakmeet_social::FriendListItemJson>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    list_friends(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn request_friend_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<RequestFriendBody>,
) -> Result<Json<streakmeet_social::FriendshipRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    request_friend(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.friend_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn reject_friend_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<AcceptFriendBody>,
) -> Result<Json<streakmeet_social::FriendshipRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    reject_friend(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.friendship_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn cancel_friend_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<AcceptFriendBody>,
) -> Result<Json<streakmeet_social::FriendshipRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    cancel_friend(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.friendship_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn accept_friend_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<AcceptFriendBody>,
) -> Result<Json<streakmeet_social::FriendshipRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    accept_friend(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.friendship_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn remove_friend_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(friendship_id): Path<String>,
) -> Result<Json<streakmeet_social::FriendshipRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    remove_friend(&state.pool, &state.outbox, &auth.user_id, &friendship_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

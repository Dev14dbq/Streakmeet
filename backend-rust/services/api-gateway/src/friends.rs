use axum::{extract::State, Json};
use serde::Deserialize;
use streakmeet_social::{accept_friend, list_friends, request_friend};

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

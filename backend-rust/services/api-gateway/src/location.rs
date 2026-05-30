use axum::{extract::State, Json};
use serde::Deserialize;
use streakmeet_location::{
    get_friends_locations, get_my_location, set_location_sharing, update_location,
};

use crate::auth::{require_email_verified, AuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharingBody {
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLocationBody {
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

pub async fn get_my_location_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<streakmeet_location::MyLocationJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    get_my_location(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn get_friends_locations_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<streakmeet_location::FriendLocationJson>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    get_friends_locations(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn set_sharing_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<SharingBody>,
) -> Result<Json<streakmeet_location::MyLocationJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    set_location_sharing(&state.pool, &state.outbox, &auth.user_id, body.enabled)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn update_location_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateLocationBody>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    update_location(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.latitude,
        body.longitude,
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

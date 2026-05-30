use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use streakmeet_streaks::{create_streak, get_streak_detail, list_streaks, record_meet_upload};

use crate::auth::{require_email_verified, AuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStreakBody {
    pub partner_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreakDetailQuery {
    pub page: Option<i32>,
    pub limit: Option<i32>,
}

pub async fn list_streaks_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<streakmeet_streaks::StreakListItemJson>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    list_streaks(&state.pool, &auth.user_id)
        .await
        .map(Json)
        .map_err(api_error_response)
}

pub async fn create_streak_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateStreakBody>,
) -> Result<Json<streakmeet_streaks::StreakRecordJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    create_streak(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        body.partner_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordMeetBody {
    pub streak_id: Option<String>,
    pub photo_base64: Option<String>,
    pub photo_url: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

pub async fn record_meet_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<RecordMeetBody>,
) -> Result<Json<streakmeet_streaks::RecordMeetResultJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    let streak_id = body.streak_id.as_deref().ok_or_else(|| {
        api_error_response(streakmeet_types::ApiError::new(
            400,
            streakmeet_types::codes::MISSING_FIELD,
            None,
        ))
    })?;
    record_meet_upload(
        &state.pool,
        &state.outbox,
        &auth.user_id,
        streak_id,
        body.photo_base64.as_deref(),
        body.photo_url.as_deref(),
        body.latitude,
        body.longitude,
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

pub async fn get_streak_detail_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(partner_nickname): Path<String>,
    Query(query): Query<StreakDetailQuery>,
) -> Result<Json<streakmeet_streaks::StreakDetailJson>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(10);
    get_streak_detail(&state.pool, &auth.user_id, &partner_nickname, page, limit)
        .await
        .map(Json)
        .map_err(api_error_response)
}

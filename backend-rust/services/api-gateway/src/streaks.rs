use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use streakmeet_streaks::{create_streak, get_streak_detail, list_streaks};

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

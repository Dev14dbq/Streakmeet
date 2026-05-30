use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::auth::{require_email_verified, AuthUser};
use crate::routes::api_error_response;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct MemoriesQuery {
    pub page: Option<String>,
    pub limit: Option<String>,
    #[serde(rename = "streakId")]
    pub streak_id: Option<String>,
}

pub async fn list_memories_handler(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<MemoriesQuery>,
) -> Result<Json<streakmeet_memories::MemoriesFeedResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let auth = require_email_verified(State(state.clone()), auth).await?;
    let (page, limit) = streakmeet_types::parse_pagination(
        query.page.as_deref(),
        query.limit.as_deref(),
        1,
        20,
        50,
    );
    streakmeet_memories::get_memories_feed(
        &state.pool,
        &auth.user_id,
        page,
        limit,
        query.streak_id.as_deref(),
    )
    .await
    .map(Json)
    .map_err(api_error_response)
}

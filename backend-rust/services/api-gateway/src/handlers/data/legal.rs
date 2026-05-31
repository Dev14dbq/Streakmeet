use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, header},
};
use serde::Deserialize;

use crate::AppState;
use crate::handlers::auth::routes::api_error_response;
use crate::middleware::auth::AuthUser;

#[derive(Debug, Deserialize)]
pub struct LegalLocaleQuery {
    pub locale: Option<String>,
}

pub async fn legal_status_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<
    Json<streakmeet_legal::LegalStatusResponse>,
    (axum::http::StatusCode, Json<serde_json::Value>),
> {
    match streakmeet_legal::get_legal_status_for_user(&state.pool, &auth.user_id).await {
        Ok(Some(status)) => Ok(Json(status)),
        Ok(None) => Err(api_error_response(streakmeet_types::ApiError::new(
            404,
            streakmeet_types::codes::USER_NOT_FOUND,
            None,
        ))),
        Err(err) => Err(api_error_response(err)),
    }
}

pub async fn legal_accept_handler(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let accepted = streakmeet_legal::accept_current_legal_for_user(&state.pool, &auth.user_id)
        .await
        .map_err(api_error_response)?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "terms": accepted.terms,
        "privacy": accepted.privacy,
    })))
}

pub async fn legal_document_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LegalLocaleQuery>,
    axum::extract::Path(slug): axum::extract::Path<String>,
) -> Result<
    Json<streakmeet_legal::LegalDocumentJson>,
    (axum::http::StatusCode, Json<serde_json::Value>),
> {
    let Some(legal_slug) = streakmeet_legal::LegalSlug::from_param(&slug) else {
        return Err(api_error_response(streakmeet_types::ApiError::new(
            404,
            streakmeet_types::codes::LEGAL_DOCUMENT_NOT_FOUND,
            None,
        )));
    };

    let raw_locale = query.locale.as_deref().or_else(|| {
        headers
            .get(header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
    });

    streakmeet_legal::get_legal_document(&state.pool, legal_slug, raw_locale)
        .await
        .map(Json)
        .map_err(api_error_response)
}

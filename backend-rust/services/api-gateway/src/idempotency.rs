//! Idempotency-Key middleware for POST mutations (24h TTL, Redis or in-memory).

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{header, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use streakmeet_auth::verify_access_token;
use tracing::{debug, warn};

use crate::AppState;

const TTL: Duration = Duration::from_secs(24 * 3600);
const MAX_BODY_BYTES: usize = 256 * 1024;
const REDIS_KEY_PREFIX: &str = "idempotency:";

#[derive(Clone)]
pub struct IdempotencyStore {
    redis: Option<redis::aio::ConnectionManager>,
    memory: Arc<DashMap<String, MemoryEntry>>,
}

#[derive(Clone, Serialize, Deserialize)]
struct CachedResponse {
    status: u16,
    content_type: Option<String>,
    body: Vec<u8>,
}

struct MemoryEntry {
    expires_at: Instant,
    response: CachedResponse,
}

impl IdempotencyStore {
    pub async fn connect_from_env() -> Self {
        let memory = Arc::new(DashMap::new());
        let redis = match std::env::var("REDIS_URL") {
            Ok(url) if !url.is_empty() => match redis::Client::open(url.as_str()) {
                Ok(client) => match redis::aio::ConnectionManager::new(client).await {
                    Ok(conn) => {
                        tracing::info!("Idempotency store using Redis");
                        Some(conn)
                    }
                    Err(err) => {
                        warn!(error = %err, "Redis unavailable, using in-memory idempotency");
                        None
                    }
                },
                Err(err) => {
                    warn!(error = %err, "invalid REDIS_URL, using in-memory idempotency");
                    None
                }
            },
            _ => {
                tracing::info!("Idempotency store using in-memory fallback");
                None
            }
        };

        Self { redis, memory }
    }

    fn cache_key(user_id: &str, idempotency_key: &str, path: &str) -> String {
        format!("{user_id}:{path}:{idempotency_key}")
    }

    async fn get(&self, key: &str) -> Option<CachedResponse> {
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let redis_key = format!("{REDIS_KEY_PREFIX}{key}");
            if let Ok(raw) = redis::cmd("GET")
                .arg(&redis_key)
                .query_async::<Option<String>>(&mut conn)
                .await
            {
                if let Some(json) = raw {
                    if let Ok(cached) = serde_json::from_str::<CachedResponse>(&json) {
                        return Some(cached);
                    }
                }
            }
        }

        self.purge_expired_memory();
        self.memory.get(key).map(|entry| entry.response.clone())
    }

    async fn put(&self, key: &str, response: CachedResponse) {
        if let Some(redis) = &self.redis {
            let mut conn = redis.clone();
            let redis_key = format!("{REDIS_KEY_PREFIX}{key}");
            if let Ok(json) = serde_json::to_string(&response) {
                let _: Result<(), _> = redis::cmd("SETEX")
                    .arg(&redis_key)
                    .arg(TTL.as_secs())
                    .arg(json)
                    .query_async(&mut conn)
                    .await;
            }
            return;
        }

        self.memory.insert(
            key.to_string(),
            MemoryEntry {
                expires_at: Instant::now() + TTL,
                response,
            },
        );
    }

    fn purge_expired_memory(&self) {
        let now = Instant::now();
        self.memory.retain(|_, entry| entry.expires_at > now);
    }
}

fn cached_to_response(cached: CachedResponse) -> Response {
    let mut builder =
        Response::builder().status(StatusCode::from_u16(cached.status).unwrap_or(StatusCode::OK));
    if let Some(ct) = cached.content_type {
        builder = builder.header(header::CONTENT_TYPE, ct);
    }
    builder
        .header("X-Idempotency-Replayed", "true")
        .body(Body::from(cached.body))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

pub fn requires_idempotency(method: &Method, path: &str) -> bool {
    if *method != Method::POST {
        return false;
    }
    matches!(
        path,
        "/api/friends/request"
            | "/api/friends/accept"
            | "/api/friends/reject"
            | "/api/friends/cancel"
            | "/api/streaks/"
    )
}

fn bearer_user_id(
    request: &Request,
    jwt_secret: &str,
) -> Option<String> {
    let auth = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())?;
    let token = auth.strip_prefix("Bearer ")?;
    verify_access_token(token, jwt_secret).ok()
}

pub async fn idempotency_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    if !requires_idempotency(&method, &path) {
        return next.run(request).await;
    }

    let idempotency_key = request
        .headers()
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .map(str::to_string);

    let Some(idempotency_key) = idempotency_key else {
        return next.run(request).await;
    };

    let Some(user_id) = bearer_user_id(&request, &state.auth_config.jwt_secret) else {
        return next.run(request).await;
    };

    let cache_key = IdempotencyStore::cache_key(&user_id, &idempotency_key, &path);
    if let Some(cached) = state.idempotency.get(&cache_key).await {
        debug!(user_id = %user_id, path = %path, "idempotency replay");
        return cached_to_response(cached);
    }

    let response = next.run(request).await;
    let (parts, body) = response.into_parts();
    let body_bytes = match to_bytes(body, MAX_BODY_BYTES).await {
        Ok(bytes) => bytes.to_vec(),
        Err(_) => return Response::from_parts(parts, Body::empty()),
    };

    let cached = CachedResponse {
        status: parts.status.as_u16(),
        content_type: parts
            .headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string),
        body: body_bytes.clone(),
    };

    if parts.status.is_success() || parts.status.is_client_error() {
        state.idempotency.put(&cache_key, cached).await;
    }

    Response::from_parts(parts, Body::from(body_bytes))
}

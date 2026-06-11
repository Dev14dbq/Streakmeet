//! In-memory rate limits — parity with Node `backend/src/auth/middleware.ts` + global limit.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    Json,
    body::Body,
    extract::{ConnectInfo, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;

use crate::AppState;

#[derive(Clone)]
struct Window {
    count: u32,
    reset_at: Instant,
}

#[derive(Clone)]
pub struct RateLimitStore {
    buckets: Arc<DashMap<String, Window>>,
}

impl RateLimitStore {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
        }
    }

    fn check(&self, key: &str, max: u32, window: Duration) -> bool {
        let now = Instant::now();
        let mut entry = self.buckets.entry(key.to_string()).or_insert(Window {
            count: 0,
            reset_at: now + window,
        });

        if now >= entry.reset_at {
            entry.count = 0;
            entry.reset_at = now + window;
        }

        if entry.count >= max {
            return false;
        }

        entry.count += 1;
        true
    }

    fn purge_stale(&self) {
        let now = Instant::now();
        self.buckets.retain(|_, w| w.reset_at > now);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LimitClass {
    Global,
    Auth,
    Sensitive,
    Media,
}

fn limit_class(path: &str, method: &str) -> Option<LimitClass> {
    if method != "POST" && method != "GET" {
        return Some(LimitClass::Global);
    }

    if matches!(
        path,
        "/api/auth/login"
            | "/api/auth/register"
            | "/api/auth/check-email"
            | "/api/auth/google"
            | "/api/auth/apple"
            | "/api/auth/apple/start"
            | "/api/auth/apple/callback"
            | "/api/auth/restore-account"
    ) {
        return Some(LimitClass::Auth);
    }

    if matches!(
        path,
        "/api/auth/forgot-password"
            | "/api/auth/reset-password"
            | "/api/auth/resend-verification"
    ) {
        return Some(LimitClass::Sensitive);
    }

    if path == "/api/auth/enroll-face"
        || path == "/api/streaks/magic-meet"
        || path == "/api/users/avatar"
        || path.ends_with("/remote-selfie/init")
        || path.contains("/remote-selfie/reply/")
    {
        return Some(LimitClass::Media);
    }

    Some(LimitClass::Global)
}

fn limits_for(class: LimitClass) -> (u32, Duration) {
    match class {
        LimitClass::Global => (100, Duration::from_secs(60)),
        LimitClass::Auth => (10, Duration::from_secs(60)),
        LimitClass::Sensitive => (10, Duration::from_secs(15 * 60)),
        LimitClass::Media => (5, Duration::from_secs(60)),
    }
}

fn client_ip<B>(request: &Request<B>, connect: Option<SocketAddr>) -> String {
    if let Some(xff) = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(first) = xff.split(',').next() {
            let ip = first.trim();
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }

    connect
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn rate_limited_response() -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(serde_json::json!({
            "error": "Слишком много запросов",
            "code": "RATE_LIMITED",
        })),
    )
        .into_response()
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    connect: Option<ConnectInfo<SocketAddr>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if state.rate_limit.buckets.len() > 10_000 {
        state.rate_limit.purge_stale();
    }

    let path = request.uri().path().to_string();
    let method = request.method().as_str().to_string();
    let ip = client_ip(&request, connect.map(|c| c.0));

    let mut classes = vec![LimitClass::Global];
    if let Some(extra) = limit_class(&path, &method)
        && extra != LimitClass::Global
    {
        classes.push(extra);
    }

    for class in classes {
        let (max, window) = limits_for(class);
        let bucket = match class {
            LimitClass::Global => format!("global:{ip}"),
            LimitClass::Auth => format!("auth:{ip}"),
            LimitClass::Sensitive => format!("sensitive:{ip}"),
            LimitClass::Media => format!("media:{ip}"),
        };
        if !state.rate_limit.check(&bucket, max, window) {
            tracing::warn!(%ip, %path, ?class, "rate limit exceeded");
            return rate_limited_response();
        }
    }

    next.run(request).await
}

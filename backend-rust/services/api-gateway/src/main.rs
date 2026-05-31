mod auth;
mod auth_routes;
mod friends;
mod idempotency;
mod legal;
mod location;
mod media;
mod memories;
mod routes;
mod streaks;
mod users;

use axum::{
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, patch, post},
    Router,
};
use streakmeet_auth::config_from_env;
use streakmeet_db::connect_from_env;
use streakmeet_nats::connect_from_env as connect_nats;
use streakmeet_sync::{run_outbox_worker, OutboxPublisher};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub pool: streakmeet_db::PgPool,
    pub auth_config: streakmeet_auth::AuthConfig,
    pub outbox: OutboxPublisher,
    pub idempotency: idempotency::IdempotencyStore,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let pool = connect_from_env().await?;
    let auth_config = config_from_env();
    let nats = connect_nats().await?;
    let outbox = OutboxPublisher::new(pool.clone(), nats.clone());
    run_outbox_worker(pool.clone(), nats);

    if std::env::var("SEED_LEGAL_DOCUMENTS")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(true)
    {
        let pool_seed = pool.clone();
        tokio::spawn(async move {
            if let Err(err) = streakmeet_legal::ensure_legal_documents(&pool_seed).await {
                tracing::error!(error = %err, "[legal] Failed to seed legal documents");
            }
        });
    }

    tokio::spawn(async {
        if let Err(err) = streakmeet_media::ensure_bucket().await {
            tracing::error!(error = %err, "[media] bucket check failed");
        }
    });
    let idempotency = idempotency::IdempotencyStore::connect_from_env().await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Axum default is 2MB; photo uploads are base64 JSON and need more headroom.
    let max_body: usize = std::env::var("API_MAX_BODY_BYTES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(32 * 1024 * 1024);
    tracing::info!(max_body_bytes = max_body, "api-gateway request body limit");

    let state = AppState {
        pool,
        auth_config,
        outbox,
        idempotency,
    };

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/auth/login", post(routes::login))
        .route("/api/auth/register", post(auth_routes::register_handler))
        .route("/api/auth/check-email", post(auth_routes::check_email_handler))
        .route("/api/auth/google", post(auth_routes::google_login_handler))
        .route("/api/auth/apple", post(auth_routes::apple_login_handler))
        .route("/api/auth/forgot-password", post(auth_routes::forgot_password_handler))
        .route("/api/auth/reset-password", post(auth_routes::reset_password_handler))
        .route("/api/auth/verify-email", get(auth_routes::verify_email_get_handler))
        .route("/api/auth/verify-email", post(auth_routes::verify_email_post_handler))
        .route(
            "/api/auth/resend-verification",
            post(auth_routes::resend_verification_handler),
        )
        .route("/api/auth/enroll-face", post(auth_routes::enroll_face_handler))
        .route(
            "/api/auth/restore-account",
            post(auth_routes::restore_account_handler),
        )
        .route("/api/friends", get(friends::list_friends_handler))
        .route("/api/friends/", get(friends::list_friends_handler))
        .route("/api/friends/request", post(friends::request_friend_handler))
        .route("/api/friends/accept", post(friends::accept_friend_handler))
        .route("/api/friends/reject", post(friends::reject_friend_handler))
        .route("/api/friends/cancel", post(friends::cancel_friend_handler))
        .route("/api/friends/{id}", delete(friends::remove_friend_handler))
        .route("/api/location/me", get(location::get_my_location_handler))
        .route("/api/location/friends", get(location::get_friends_locations_handler))
        .route("/api/location/sharing", post(location::set_sharing_handler))
        .route("/api/location/update", post(location::update_location_handler))
        .route("/api/users/me", get(users::get_me_handler))
        .route("/api/users/me", patch(users::patch_me_handler))
        .route("/api/users/me", delete(users::delete_me_handler))
        .route("/api/users/settings", patch(users::patch_settings_handler))
        .route("/api/users/preferences", patch(users::patch_preferences_handler))
        .route("/api/users/email", patch(users::patch_email_handler))
        .route("/api/users/password", patch(users::patch_password_handler))
        .route("/api/users/avatar", post(users::upload_avatar_handler))
        .route("/api/users/photos", get(users::list_photos_handler))
        .route("/api/users/search", get(users::search_handler))
        .route("/api/public/users/{nickname}", get(users::public_profile_handler))
        .route(
            "/api/public/users/{nickname}/photos",
            get(users::public_photos_handler),
        )
        .route("/api/memories", get(memories::list_memories_handler))
        .route("/api/memories/", get(memories::list_memories_handler))
        .route("/api/legal/status/me", get(legal::legal_status_handler))
        .route("/api/legal/accept", post(legal::legal_accept_handler))
        .route("/api/legal/{slug}", get(legal::legal_document_handler))
        .route("/uploads/{filename}", get(media::serve_upload_handler))
        .route("/api/streaks/meet", post(streaks::record_meet_handler))
        .route("/api/streaks/magic-meet", post(streaks::magic_meet_handler))
        .route("/api/streaks", get(streaks::list_streaks_handler))
        .route("/api/streaks", post(streaks::create_streak_handler))
        .route("/api/streaks/", get(streaks::list_streaks_handler))
        .route("/api/streaks/", post(streaks::create_streak_handler))
        .route(
            "/api/streaks/{streak_id}/remote-selfie/init",
            post(streaks::init_remote_selfie_handler),
        )
        .route(
            "/api/streaks/{streak_id}/remote-selfie/reply/{request_id}",
            post(streaks::reply_remote_selfie_handler),
        )
        .route(
            "/api/streaks/{partner_nickname}/remind",
            post(streaks::remind_partner_handler),
        )
        .route(
            "/api/streaks/{partner_nickname}",
            get(streaks::get_streak_detail_handler),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            idempotency::idempotency_middleware,
        ))
        .with_state(state)
        .layer(DefaultBodyLimit::max(max_body))
        .layer(cors);

    let port: u16 = std::env::var("API_GATEWAY_PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!(%port, "api-gateway listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

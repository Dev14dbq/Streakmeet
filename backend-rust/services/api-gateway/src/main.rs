mod auth;
mod friends;
mod routes;
mod streaks;

use axum::{
    routing::{get, post},
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

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = AppState {
        pool,
        auth_config,
        outbox,
    };

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/auth/login", post(routes::login))
        .route("/api/friends/", get(friends::list_friends_handler))
        .route("/api/friends/request", post(friends::request_friend_handler))
        .route("/api/friends/accept", post(friends::accept_friend_handler))
        .route("/api/friends/reject", post(friends::reject_friend_handler))
        .route("/api/friends/cancel", post(friends::cancel_friend_handler))
        .route("/api/streaks/", get(streaks::list_streaks_handler))
        .route("/api/streaks/", post(streaks::create_streak_handler))
        .route(
            "/api/streaks/:partner_nickname",
            get(streaks::get_streak_detail_handler),
        )
        .with_state(state)
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

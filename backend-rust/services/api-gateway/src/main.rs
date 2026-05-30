mod routes;

use axum::{routing::{get, post}, Router};
use streakmeet_auth::config_from_env;
use streakmeet_db::connect_from_env;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub pool: streakmeet_db::PgPool,
    pub auth_config: streakmeet_auth::AuthConfig,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let pool = connect_from_env().await?;
    let auth_config = config_from_env();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = AppState { pool, auth_config };

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/auth/login", post(routes::login))
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

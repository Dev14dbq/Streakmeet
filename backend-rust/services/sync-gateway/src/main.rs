//! Sync gateway — Connect JSON streaming + NATS fan-out.

mod catchup;
mod connect;
mod hub;
mod nats;

use std::sync::Arc;

use axum::{
    Router,
    routing::{get, post},
};
use streakmeet_db::connect_from_env;
use streakmeet_nats::connect_from_env as connect_nats;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

use crate::hub::SyncHub;

#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<SyncHub>,
    pub pool: streakmeet_db::PgPool,
    pub nats: async_nats::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let pool = connect_from_env().await?;
    let nats = connect_nats().await?;
    let hub = Arc::new(SyncHub::new());

    let hub_for_nats = hub.clone();
    let nats_for_fanout = nats.clone();
    tokio::spawn(async move {
        if let Err(err) = nats::run_nats_fanout(hub_for_nats, nats_for_fanout).await {
            tracing::error!(error = %err, "NATS fan-out task exited");
        }
    });

    let state = AppState { hub, pool, nats };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let subscribe = post(connect::connect_subscribe);
    let catch_up = post(connect::connect_catch_up);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/streakmeet.v1.SyncService/Subscribe", subscribe.clone())
        .route("/streakmeet.v1.SyncService/CatchUp", catch_up.clone())
        .route("/connect/streakmeet.v1.SyncService/Subscribe", subscribe)
        .route("/connect/streakmeet.v1.SyncService/CatchUp", catch_up)
        .with_state(state)
        .layer(cors);

    let port: u16 = std::env::var("SYNC_GATEWAY_PORT")
        .unwrap_or_else(|_| "8081".into())
        .parse()?;
    let addr = format!("0.0.0.0:{port}");

    tracing::info!(%port, "sync-gateway listening (Connect JSON + JetStream fan-out)");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

//! Sync gateway — server-stream stub emitting heartbeat SyncEnvelope every 30s.

mod sync;

use streakmeet_proto::sync_service_server::SyncServiceServer;
use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let port: u16 = std::env::var("SYNC_GATEWAY_PORT")
        .unwrap_or_else(|_| "8081".into())
        .parse()?;
    let addr = format!("0.0.0.0:{port}").parse()?;

    let svc = SyncServiceServer::new(sync::SyncGateway);

    tracing::info!(%port, "sync-gateway listening");
    Server::builder()
        .add_service(svc)
        .serve(addr)
        .await?;

    Ok(())
}

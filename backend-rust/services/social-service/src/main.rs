mod grpc;

use streakmeet_nats::connect_from_env;
use streakmeet_proto::social_service_server::SocialServiceServer;
use streakmeet_sync::{run_outbox_worker, OutboxPublisher};
use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let pool = streakmeet_db::connect_from_env().await?;
    let nats = connect_from_env().await?;
    let publisher = OutboxPublisher::new(pool.clone(), nats.clone());
    run_outbox_worker(pool.clone(), nats);

    let port: u16 = std::env::var("SOCIAL_SERVICE_PORT")
        .unwrap_or_else(|_| "50053".into())
        .parse()?;
    let addr = format!("0.0.0.0:{port}").parse()?;

    let svc = SocialServiceServer::new(grpc::SocialGrpc {
        pool,
        publisher,
    });

    tracing::info!(%port, "social-service listening");
    Server::builder().add_service(svc).serve(addr).await?;

    Ok(())
}

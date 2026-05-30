mod grpc;

use streakmeet_auth::config_from_env;
use streakmeet_db::connect_from_env;
use streakmeet_proto::auth_service_server::AuthServiceServer;
use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let pool = connect_from_env().await?;
    let config = config_from_env();

    let port: u16 = std::env::var("AUTH_SERVICE_PORT")
        .unwrap_or_else(|_| "50051".into())
        .parse()?;
    let addr = format!("0.0.0.0:{port}").parse()?;

    let svc = AuthServiceServer::new(grpc::AuthGrpc { pool, config });

    tracing::info!(%port, "auth-service listening");
    Server::builder()
        .add_service(svc)
        .serve(addr)
        .await?;

    Ok(())
}

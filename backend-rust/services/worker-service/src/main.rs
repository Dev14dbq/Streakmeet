use std::time::Duration;

use streakmeet_nats::connect_from_env;
use streakmeet_streaks::worker::{
    process_remote_selfie_expiry, process_streak_burns, process_streak_warnings,
};
use streakmeet_sync::{run_outbox_worker, OutboxPublisher};
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

    tracing::info!(
        "worker-service: streak warnings + burn + remote selfie expiry every 5 min"
    );

    let mut interval = tokio::time::interval(Duration::from_secs(300));
    loop {
        interval.tick().await;
        match process_streak_warnings(&pool, &publisher).await {
            Ok(n) if n > 0 => tracing::info!(sent = n, "streak warning cycle"),
            Ok(_) => tracing::debug!("streak warning cycle: none"),
            Err(err) => tracing::warn!(error = %err, "streak warning cycle failed"),
        }
        match process_streak_burns(&pool, &publisher).await {
            Ok(n) if n > 0 => tracing::info!(burned = n, "streak burn cycle"),
            Ok(_) => tracing::debug!("streak burn cycle: none"),
            Err(err) => tracing::warn!(error = %err, "streak burn cycle failed"),
        }
        match process_remote_selfie_expiry(&pool, &publisher).await {
            Ok(n) if n > 0 => tracing::info!(expired = n, "remote selfie expiry cycle"),
            Ok(_) => tracing::debug!("remote selfie expiry cycle: none"),
            Err(err) => tracing::warn!(error = %err, "remote selfie expiry cycle failed"),
        }
    }
}

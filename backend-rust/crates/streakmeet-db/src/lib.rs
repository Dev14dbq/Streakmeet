//! PostgreSQL pool setup — same `DATABASE_URL` as Node backend.

use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::time::Duration;

pub async fn connect_from_env() -> Result<PgPool> {
    let url = std::env::var("DATABASE_URL").context("DATABASE_URL is not set")?;
    connect(&url).await
}

pub async fn connect(url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(url)
        .await
        .context("failed to connect to PostgreSQL")?;

    tracing::info!("connected to PostgreSQL");
    Ok(pool)
}

use anyhow::{Context, Result};
use std::path::PathBuf;

pub fn url_to_key(relative_url: &str) -> String {
    relative_url.trim_start_matches('/').to_string()
}

fn local_uploads_dir() -> PathBuf {
    std::env::var("UPLOADS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/streakmeet-uploads"))
}

/// Write AVIF bytes to local uploads dir (MinIO/S3 upload deferred — use Node media path in prod if needed).
pub async fn upload_avif(relative_url: &str, buffer: &[u8]) -> Result<()> {
    let key = url_to_key(relative_url);
    let dir = local_uploads_dir();
    tokio::fs::create_dir_all(&dir).await.context("create uploads dir")?;
    let file_path = dir.join(key.strip_prefix("uploads/").unwrap_or(&key));
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(&file_path, buffer)
        .await
        .context("write local upload")?;
    Ok(())
}

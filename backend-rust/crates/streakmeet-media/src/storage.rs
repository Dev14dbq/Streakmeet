use anyhow::{Context, Result};
use s3::bucket::Bucket;
use s3::creds::Credentials;
use s3::Region;
use std::path::PathBuf;
use std::sync::OnceLock;

static BUCKET: OnceLock<Option<Box<Bucket>>> = OnceLock::new();

pub fn url_to_key(relative_url: &str) -> String {
    relative_url.trim_start_matches('/').to_string()
}

pub fn is_media_url(path: &str) -> bool {
    path.starts_with("/uploads/")
}

fn local_uploads_dir() -> PathBuf {
    std::env::var("UPLOADS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/streakmeet-uploads"))
}

fn local_path(relative_url: &str) -> PathBuf {
    let key = url_to_key(relative_url);
    local_uploads_dir().join(key.strip_prefix("uploads/").unwrap_or(&key))
}

pub fn use_s3() -> bool {
    std::env::var("S3_ENDPOINT").is_ok() && std::env::var("S3_ACCESS_KEY_ID").is_ok()
}

fn s3_bucket_name() -> String {
    std::env::var("S3_BUCKET").unwrap_or_else(|_| "streakmeet-media".into())
}

fn s3_bucket() -> Option<&'static Bucket> {
    BUCKET
        .get_or_init(|| {
            if !use_s3() {
                return None;
            }
            let endpoint = std::env::var("S3_ENDPOINT").ok()?;
            let region_name = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into());
            let access_key = std::env::var("S3_ACCESS_KEY_ID").ok()?;
            let secret_key = std::env::var("S3_SECRET_ACCESS_KEY").unwrap_or_default();
            let force_path_style = std::env::var("S3_FORCE_PATH_STYLE")
                .map(|v| v != "false")
                .unwrap_or(true);

            let region = Region::Custom {
                region: region_name,
                endpoint: endpoint.clone(),
            };
            let creds = Credentials::new(
                Some(access_key.as_str()),
                Some(secret_key.as_str()),
                None,
                None,
                None,
            )
            .ok()?;

            let mut bucket = Bucket::new(&s3_bucket_name(), region, creds).ok()?;
            if force_path_style {
                bucket.set_path_style();
            }
            Some(bucket)
        })
        .as_ref()
        .map(|b| b.as_ref())
}

pub async fn ensure_bucket() -> Result<()> {
    if !use_s3() {
        tokio::fs::create_dir_all(local_uploads_dir())
            .await
            .context("create uploads dir")?;
        return Ok(());
    }

    let bucket = s3_bucket().context("S3 bucket init failed")?;
    if bucket.head_object("/").await.is_err() {
        // MinIO creates bucket on first put; ignore head failures for empty bucket.
    }
    Ok(())
}

/// Write AVIF bytes to S3 or local uploads dir.
pub async fn upload_avif(relative_url: &str, buffer: &[u8]) -> Result<()> {
    ensure_bucket().await?;

    if use_s3() {
        let bucket = s3_bucket().context("S3 bucket init failed")?;
        let key = url_to_key(relative_url);
        bucket
            .put_object_with_content_type(&key, buffer, "image/avif")
            .await
            .context("S3 put object")?;
        return Ok(());
    }

    let file_path = local_path(relative_url);
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    tokio::fs::write(&file_path, buffer)
        .await
        .context("write local upload")?;
    Ok(())
}

pub async fn get_object_buffer(relative_url: &str) -> Result<Vec<u8>> {
    if use_s3() {
        let bucket = s3_bucket().context("S3 bucket init failed")?;
        let key = url_to_key(relative_url);
        let response = bucket
            .get_object(&key)
            .await
            .context("S3 get object")?;
        return Ok(response.bytes().to_vec());
    }

    tokio::fs::read(local_path(relative_url))
        .await
        .with_context(|| format!("read local upload {relative_url}"))
}

pub struct ObjectBytes {
    pub bytes: Vec<u8>,
    pub content_length: usize,
}

pub async fn get_object_bytes(relative_url: &str) -> Result<Option<ObjectBytes>> {
    if !is_media_url(relative_url) {
        return Ok(None);
    }

    match get_object_buffer(relative_url).await {
        Ok(bytes) => {
            let len = bytes.len();
            Ok(Some(ObjectBytes {
                bytes,
                content_length: len,
            }))
        }
        Err(_) if !use_s3() => Ok(None),
        Err(e) => Err(e),
    }
}

pub async fn delete_media_object(relative_url: &str) -> Result<()> {
    if !is_media_url(relative_url) {
        return Ok(());
    }

    if use_s3() {
        let bucket = s3_bucket().context("S3 bucket init failed")?;
        let key = url_to_key(relative_url);
        let _ = bucket.delete_object(&key).await;
        return Ok(());
    }

    let _ = tokio::fs::remove_file(local_path(relative_url)).await;
    Ok(())
}

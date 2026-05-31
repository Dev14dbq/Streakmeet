use anyhow::{Context, Result};
use sqlx::PgPool;

pub fn url_to_key(relative_url: &str) -> String {
    relative_url.trim_start_matches('/').to_string()
}

pub fn is_media_url(path: &str) -> bool {
    path.starts_with("/uploads/")
}

pub async fn ensure_media_schema(pool: &PgPool) -> Result<()> {
    let sql = include_str!("../../../migrations/002_media_objects.sql");
    for statement in sql.split(';').map(str::trim).filter(|s| !s.is_empty()) {
        sqlx::query(statement)
            .execute(pool)
            .await
            .context("apply media_objects migration")?;
    }
    import_legacy_disk_uploads(pool).await?;
    Ok(())
}

/// One-time import from legacy `uploads/` folder (if present).
async fn import_legacy_disk_uploads(pool: &PgPool) -> Result<()> {
    let dir = std::env::var("LEGACY_UPLOADS_DIR")
        .ok()
        .map(std::path::PathBuf::from)
        .or_else(|| {
            let p = std::path::PathBuf::from("/home/streakmeet/uploads");
            p.is_dir().then_some(p)
        });

    let Some(dir) = dir else {
        return Ok(());
    };

    let mut entries = tokio::fs::read_dir(&dir)
        .await
        .context("read legacy uploads dir")?;
    let mut imported = 0u32;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.ends_with(".avif") {
            continue;
        }

        let key = format!("uploads/{name}");
        let exists: bool =
            sqlx::query_scalar(r#"SELECT EXISTS(SELECT 1 FROM media_objects WHERE key = $1)"#)
                .bind(&key)
                .fetch_one(pool)
                .await?;
        if exists {
            continue;
        }

        let data = tokio::fs::read(&path)
            .await
            .with_context(|| format!("read {path:?}"))?;
        sqlx::query(
            r#"
            INSERT INTO media_objects (key, data, content_type)
            VALUES ($1, $2, 'image/avif')
            ON CONFLICT (key) DO NOTHING
            "#,
        )
        .bind(&key)
        .bind(&data)
        .execute(pool)
        .await?;
        imported += 1;
    }

    if imported > 0 {
        tracing::info!(imported, dir = %dir.display(), "imported legacy uploads into PostgreSQL");
    }
    Ok(())
}

pub async fn upload_avif(pool: &PgPool, relative_url: &str, buffer: &[u8]) -> Result<()> {
    let key = url_to_key(relative_url);
    if key.is_empty() || key.contains("..") {
        return Err(anyhow::anyhow!("invalid media key"));
    }

    sqlx::query(
        r#"
        INSERT INTO media_objects (key, data, content_type)
        VALUES ($1, $2, 'image/avif')
        ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data,
            content_type = EXCLUDED.content_type,
            created_at = NOW()
        "#,
    )
    .bind(&key)
    .bind(buffer)
    .execute(pool)
    .await
    .context("store media object")?;

    Ok(())
}

pub async fn get_object_buffer(pool: &PgPool, relative_url: &str) -> Result<Vec<u8>> {
    let key = url_to_key(relative_url);
    let row: Option<Vec<u8>> =
        sqlx::query_scalar(r#"SELECT data FROM media_objects WHERE key = $1"#)
            .bind(&key)
            .fetch_optional(pool)
            .await
            .context("load media object")?;

    row.ok_or_else(|| anyhow::anyhow!("media not found: {relative_url}"))
}

pub struct ObjectBytes {
    pub bytes: Vec<u8>,
    pub content_length: usize,
    pub content_type: String,
}

pub async fn get_object_bytes(pool: &PgPool, relative_url: &str) -> Result<Option<ObjectBytes>> {
    if !is_media_url(relative_url) {
        return Ok(None);
    }

    let key = url_to_key(relative_url);
    let row: Option<(Vec<u8>, String)> =
        sqlx::query_as(r#"SELECT data, content_type FROM media_objects WHERE key = $1"#)
            .bind(&key)
            .fetch_optional(pool)
            .await
            .context("load media object")?;

    let Some((bytes, content_type)) = row else {
        return Ok(None);
    };
    let len = bytes.len();
    Ok(Some(ObjectBytes {
        content_length: len,
        content_type,
        bytes,
    }))
}

use anyhow::{Context, Result};
use sqlx::PgPool;

pub fn url_to_key(relative_url: &str) -> String {
    relative_url.trim_start_matches('/').to_string()
}

pub fn is_media_url(path: &str) -> bool {
    path.starts_with("/uploads/")
}

pub async fn ensure_media_schema(pool: &PgPool) -> Result<()> {
    for migration in [
        include_str!("../../../migrations/002_media_objects.sql"),
        include_str!("../../../migrations/003_media_uploaded_by.sql"),
    ] {
        for statement in migration.split(';').map(str::trim).filter(|s| !s.is_empty()) {
            sqlx::query(statement)
                .execute(pool)
                .await
                .with_context(|| format!("apply media migration: {statement}"))?;
        }
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

pub async fn upload_avif(
    pool: &PgPool,
    relative_url: &str,
    buffer: &[u8],
    uploaded_by: Option<&str>,
) -> Result<()> {
    let key = url_to_key(relative_url);
    if key.is_empty() || key.contains("..") {
        return Err(anyhow::anyhow!("invalid media key"));
    }

    sqlx::query(
        r#"
        INSERT INTO media_objects (key, data, content_type, uploaded_by)
        VALUES ($1, $2, 'image/avif', $3)
        ON CONFLICT (key) DO UPDATE
        SET data = EXCLUDED.data,
            content_type = EXCLUDED.content_type,
            uploaded_by = COALESCE(EXCLUDED.uploaded_by, media_objects.uploaded_by),
            created_at = NOW()
        "#,
    )
    .bind(&key)
    .bind(buffer)
    .bind(uploaded_by)
    .execute(pool)
    .await
    .context("store media object")?;

    Ok(())
}

/// Ensures `relative_url` is a stored upload owned by `user_id` (or legacy row with user id in key).
pub async fn assert_media_owned_by(
    pool: &PgPool,
    relative_url: &str,
    user_id: &str,
) -> Result<(), anyhow::Error> {
    if !is_media_url(relative_url) {
        return Err(anyhow::anyhow!("not a media url"));
    }

    let key = url_to_key(relative_url);
    let row: Option<(Option<String>,)> =
        sqlx::query_as(r#"SELECT uploaded_by FROM media_objects WHERE key = $1"#)
            .bind(&key)
            .fetch_optional(pool)
            .await
            .context("lookup media owner")?;

    let Some((uploaded_by,)) = row else {
        return Err(anyhow::anyhow!("media not found"));
    };

    if uploaded_by.as_deref() == Some(user_id) {
        return Ok(());
    }

    // Legacy rows imported before uploaded_by existed.
    if uploaded_by.is_none() && key.contains(user_id) {
        return Ok(());
    }

    Err(anyhow::anyhow!("media not owned by user"))
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

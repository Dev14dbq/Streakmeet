//! Account helpers — parity with `backend/src/common/account.ts`.

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use streakmeet_types::{codes, ApiError};

use crate::models::{is_retention_expired, UserRow};

pub const USER_PROFILE_SELECT: &str = r#"
    id, email, "passwordHash", nickname, "qrCodeId", "gemsBalance",
    "faceEnrolled", "emailVerifiedAt", "avatarUrl", timezone,
    "isPublic", "notifyFriends", "notifyMeet", "geoOnPhotos", "deletedAt"
"#;

pub async fn purge_user(pool: &PgPool, user_id: &str) -> Result<(), ApiError> {
    sqlx::query(r#"DELETE FROM meet_proofs WHERE "uploadedById" = $1"#)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    sqlx::query(r#"DELETE FROM users WHERE id = $1"#)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(())
}

pub async fn find_active_user_by_nickname(
    pool: &PgPool,
    nickname: &str,
) -> Result<Option<UserRow>, ApiError> {
    let normalized = nickname.to_lowercase();
    let sql = format!(
        r#"SELECT {USER_PROFILE_SELECT} FROM users WHERE LOWER(nickname) = $1 AND "deletedAt" IS NULL LIMIT 1"#
    );
    sqlx::query_as::<_, UserRow>(&sql)
        .bind(&normalized)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

pub async fn load_full_user(pool: &PgPool, user_id: &str) -> Result<Option<UserRow>, ApiError> {
    let sql = format!(r#"SELECT {USER_PROFILE_SELECT} FROM users WHERE id = $1"#);
    sqlx::query_as::<_, UserRow>(&sql)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

pub async fn accept_current_legal_for_user(pool: &PgPool, user_id: &str) -> Result<(), ApiError> {
    let rows: Vec<(String, i32)> = sqlx::query_as(
        r#"SELECT slug::text, version FROM legal_documents"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let terms = rows
        .iter()
        .find(|(slug, _)| slug == "TERMS")
        .map(|(_, v)| *v)
        .unwrap_or(1);
    let privacy = rows
        .iter()
        .find(|(slug, _)| slug == "PRIVACY")
        .map(|(_, v)| *v)
        .unwrap_or(1);

    sqlx::query(
        r#"
        UPDATE users
        SET "acceptedTermsVersion" = $1, "acceptedPrivacyVersion" = $2
        WHERE id = $3
        "#,
    )
    .bind(terms)
    .bind(privacy)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(())
}

pub async fn handle_deleted_email_conflict(
    pool: &PgPool,
    user: &UserRow,
) -> Result<(), ApiError> {
    let Some(deleted_at) = user.deleted_at else {
        return Err(ApiError::new(409, codes::EMAIL_ALREADY_IN_USE, None));
    };
    if is_retention_expired(deleted_at) {
        purge_user(pool, &user.id).await?;
        Ok(())
    } else {
        Err(ApiError::new(409, codes::ACCOUNT_DELETED, None))
    }
}

pub fn normalize_timezone(tz: Option<&str>) -> String {
    tz.filter(|t| is_valid_timezone(t))
        .unwrap_or("UTC")
        .to_string()
}

pub fn is_valid_timezone(tz: &str) -> bool {
    !tz.is_empty() && tz.len() <= 64 && tz.chars().all(|c| c.is_ascii() && !c.is_whitespace())
}

pub async fn sync_timezone(pool: &PgPool, user_id: &str, timezone: Option<&str>) {
    let Some(tz) = timezone.filter(|t| is_valid_timezone(t)) else {
        return;
    };
    let _ = sqlx::query(r#"UPDATE users SET timezone = $1 WHERE id = $2"#)
        .bind(tz)
        .bind(user_id)
        .execute(pool)
        .await;
}

pub fn safe_nickname(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or("user")
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .take(20)
        .collect()
}

pub async fn assert_not_deleted_account(pool: &PgPool, user: &UserRow) -> Result<(), ApiError> {
    let Some(deleted_at) = user.deleted_at else {
        return Ok(());
    };
    if is_retention_expired(deleted_at) {
        purge_user(pool, &user.id).await?;
        return Err(ApiError::new(401, codes::INVALID_CREDENTIALS, None));
    }
    Err(crate::models::deleted_account_error(user))
}

pub async fn restore_deleted_user(
    pool: &PgPool,
    user_id: &str,
    oauth_verified: bool,
) -> Result<UserRow, ApiError> {
    if oauth_verified {
        sqlx::query(
            r#"
            UPDATE users
            SET "deletedAt" = NULL, "emailVerifiedAt" = NOW(), "emailVerifyToken" = NULL
            WHERE id = $1
            "#,
        )
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    } else {
        sqlx::query(r#"UPDATE users SET "deletedAt" = NULL WHERE id = $1"#)
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    }
    load_full_user(pool, user_id)
        .await?
        .ok_or_else(|| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

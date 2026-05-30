//! Email/password auth — parity with `backend/src/auth/credentials.ts`.

use sqlx::PgPool;
use streakmeet_types::{codes, ApiError};

use crate::account::{
    accept_current_legal_for_user, find_active_user_by_nickname, handle_deleted_email_conflict,
    load_full_user, normalize_timezone, safe_nickname, sync_timezone, USER_PROFILE_SELECT,
};
use crate::email;
use crate::models::{AuthResponseJson, UserRow};
use crate::token::build_auth_response;
use crate::verification::{issue_email_verification, mark_email_verified};
use crate::AuthConfig;

pub async fn check_email(pool: &PgPool, email: &str) -> Result<serde_json::Value, ApiError> {
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::new(400, codes::INVALID_EMAIL, None));
    }
    let user = crate::find_user_by_email(pool, email).await?;
    Ok(serde_json::json!({ "exists": user.is_some() }))
}

pub struct RegisterInput<'a> {
    pub email: Option<&'a str>,
    pub password: Option<&'a str>,
    pub username: Option<&'a str>,
    pub timezone: Option<&'a str>,
}

pub async fn register(
    pool: &PgPool,
    config: &AuthConfig,
    input: RegisterInput<'_>,
) -> Result<AuthResponseJson, ApiError> {
    let email = input.email.filter(|s| !s.is_empty());
    let password = input.password.filter(|s| !s.is_empty());
    let username = input.username.filter(|s| !s.is_empty());

    let (email, password, username) = match (email, password, username) {
        (Some(e), Some(p), Some(u)) => (e, p, u),
        _ => return Err(ApiError::new(400, codes::MISSING_FIELD, None)),
    };

    if password.len() < 8 {
        return Err(ApiError::new(400, codes::PASSWORD_TOO_SHORT, None));
    }
    if !is_valid_username(username) {
        return Err(ApiError::new(400, codes::INVALID_USERNAME, None));
    }

    let normalized_email = email.to_lowercase().trim().to_string();
    let normalized_username = username.to_lowercase();

    if let Some(existing) = crate::find_user_by_email(pool, &normalized_email).await? {
        handle_deleted_email_conflict(pool, &existing).await?;
    }

    if find_active_user_by_nickname(pool, &normalized_username)
        .await?
        .is_some()
    {
        return Err(ApiError::new(409, codes::USERNAME_TAKEN, None));
    }

    let password_hash = bcrypt::hash(password, 12)
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    let id = streakmeet_types::new_cuid()?;
    let qr_code_id = streakmeet_types::new_cuid()?;
    let timezone = normalize_timezone(input.timezone);

    let sql = format!(
        r#"
        INSERT INTO users (id, email, "passwordHash", nickname, timezone, "qrCodeId", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING {USER_PROFILE_SELECT}
        "#
    );

    let user = sqlx::query_as::<_, UserRow>(&sql)
        .bind(&id)
        .bind(&normalized_email)
        .bind(&password_hash)
        .bind(&normalized_username)
        .bind(&timezone)
        .bind(&qr_code_id)
        .fetch_one(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    accept_current_legal_for_user(pool, &user.id).await?;

    if let Err(e) = issue_email_verification(pool, &user.id, &user.email).await {
        tracing::error!(error = %e, "[register] verification email failed");
    }

    build_auth_response(&user, config)
}

fn is_valid_username(username: &str) -> bool {
    username.len() >= 3
        && username.len() <= 20
        && username
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

pub async fn find_or_create_oauth_user(
    pool: &PgPool,
    email: &str,
    timezone: Option<&str>,
) -> Result<UserRow, ApiError> {
    let normalized = email.to_lowercase().trim().to_string();

    if let Some(user) = crate::find_user_by_email(pool, &normalized).await? {
        if user.deleted_at.is_some() {
            return Ok(user);
        }
        if let Some(tz) = timezone.filter(|t| crate::account::is_valid_timezone(t)) {
            sync_timezone(pool, &user.id, Some(tz)).await;
        }
        mark_email_verified(pool, &user.id).await?;
        return load_full_user(pool, &user.id)
            .await?
            .ok_or_else(|| ApiError::new(500, codes::INTERNAL_ERROR, None));
    }

    let mut base = safe_nickname(&normalized);
    let mut nick = base.clone();
    let mut attempt = 0;
    while find_active_user_by_nickname(pool, &nick)
        .await?
        .is_some()
    {
        attempt += 1;
        nick = format!("{base}{attempt}");
    }

    let id = streakmeet_types::new_cuid()?;
    let qr_code_id = streakmeet_types::new_cuid()?;
    let tz = timezone
        .filter(|t| crate::account::is_valid_timezone(t))
        .map(|t| t.to_string());

    let sql = if tz.is_some() {
        format!(
            r#"
            INSERT INTO users (id, email, "passwordHash", nickname, "qrCodeId", "emailVerifiedAt", timezone, "updatedAt")
            VALUES ($1, $2, '', $3, $4, NOW(), $5, NOW())
            RETURNING {USER_PROFILE_SELECT}
            "#
        )
    } else {
        format!(
            r#"
            INSERT INTO users (id, email, "passwordHash", nickname, "qrCodeId", "emailVerifiedAt", "updatedAt")
            VALUES ($1, $2, '', $3, $4, NOW(), NOW())
            RETURNING {USER_PROFILE_SELECT}
            "#
        )
    };

    let user = if let Some(tz) = &tz {
        sqlx::query_as::<_, UserRow>(&sql)
            .bind(&id)
            .bind(&normalized)
            .bind(&nick)
            .bind(&qr_code_id)
            .bind(tz)
            .fetch_one(pool)
            .await
    } else {
        sqlx::query_as::<_, UserRow>(&sql)
            .bind(&id)
            .bind(&normalized)
            .bind(&nick)
            .bind(&qr_code_id)
            .fetch_one(pool)
            .await
    }
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    accept_current_legal_for_user(pool, &user.id).await?;
    Ok(user)
}

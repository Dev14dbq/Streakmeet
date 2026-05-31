//! Email verification & password reset — parity with `backend/src/auth/verification.ts`.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use chrono::{Duration, Utc};
use sqlx::PgPool;
use streakmeet_types::{ApiError, codes};

use crate::find_user_by_email;
use crate::ops::email;

static LAST_RESEND_AT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub async fn issue_email_verification(
    pool: &PgPool,
    user_id: &str,
    email: &str,
) -> Result<(), ApiError> {
    let token = generate_token();
    sqlx::query(
        r#"
        UPDATE users
        SET "emailVerifyToken" = $1, "emailVerifiedAt" = NULL
        WHERE id = $2
        "#,
    )
    .bind(&token)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    email::send_verification_email(email, &token).await
}

pub async fn mark_email_verified(pool: &PgPool, user_id: &str) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE users
        SET "emailVerifiedAt" = NOW(), "emailVerifyToken" = NULL
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    Ok(())
}

pub async fn verify_email_with_token(pool: &PgPool, token: &str) -> Result<(), ApiError> {
    let user_id: Option<String> =
        sqlx::query_scalar(r#"SELECT id FROM users WHERE "emailVerifyToken" = $1 LIMIT 1"#)
            .bind(token)
            .fetch_optional(pool)
            .await
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some(user_id) = user_id else {
        return Err(ApiError::new(400, codes::EMAIL_VERIFY_TOKEN_INVALID, None));
    };

    mark_email_verified(pool, &user_id).await
}

pub async fn verify_email_and_get_redirect(pool: &PgPool, token: &str) -> String {
    let app_url = std::env::var("APP_PUBLIC_URL")
        .unwrap_or_else(|_| "https://spectrmod.com".into())
        .trim_end_matches('/')
        .to_string();

    if token.is_empty() {
        return format!("{app_url}/verify-email?error=invalid");
    }

    let user_id: Option<String> =
        sqlx::query_scalar(r#"SELECT id FROM users WHERE "emailVerifyToken" = $1 LIMIT 1"#)
            .bind(token)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    let Some(user_id) = user_id else {
        return format!("{app_url}/verify-email?error=invalid");
    };

    let _ = mark_email_verified(pool, &user_id).await;
    format!("{app_url}/verify-email?verified=1")
}

pub async fn resend_verification(
    pool: &PgPool,
    user_id: &str,
) -> Result<serde_json::Value, ApiError> {
    let now = Utc::now().timestamp_millis();
    {
        let map = LAST_RESEND_AT.lock().unwrap();
        if let Some(last) = map.get(user_id)
            && now - last < 60_000
        {
            return Err(ApiError::new(429, codes::RESEND_COOLDOWN, None));
        }
    }

    #[derive(sqlx::FromRow)]
    struct Row {
        email: String,
        email_verified_at: Option<chrono::NaiveDateTime>,
        password_hash: String,
    }

    let user = sqlx::query_as::<_, Row>(
        r#"
        SELECT email, "emailVerifiedAt" AS email_verified_at, "passwordHash" AS password_hash
        FROM users WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some(user) = user else {
        return Ok(serde_json::json!({ "success": true }));
    };

    if user.password_hash.is_empty() || user.email_verified_at.is_some() {
        return Ok(serde_json::json!({ "success": true }));
    }

    issue_email_verification(pool, user_id, &user.email).await?;
    LAST_RESEND_AT
        .lock()
        .unwrap()
        .insert(user_id.to_string(), now);

    Ok(serde_json::json!({ "success": true }))
}

pub async fn forgot_password(pool: &PgPool, email: &str) -> Result<serde_json::Value, ApiError> {
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::new(400, codes::INVALID_EMAIL, None));
    }

    let normalized = email.to_lowercase().trim().to_string();
    let user = find_user_by_email(pool, &normalized).await?;

    let Some(user) = user else {
        return Ok(serde_json::json!({ "success": true }));
    };

    if user.deleted_at.is_some() {
        return Ok(serde_json::json!({ "success": true }));
    }

    if user.password_hash.is_empty() {
        return Err(ApiError::new(400, codes::OAUTH_ACCOUNT_NO_PASSWORD, None));
    }

    let token = generate_token();
    let expires = Utc::now() + Duration::hours(1);

    sqlx::query(
        r#"
        UPDATE users
        SET "passwordResetToken" = $1, "passwordResetExpires" = $2
        WHERE id = $3
        "#,
    )
    .bind(&token)
    .bind(expires)
    .bind(&user.id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    email::send_password_reset_email(&user.email, &token).await?;
    Ok(serde_json::json!({ "success": true }))
}

pub async fn reset_password(
    pool: &PgPool,
    token: Option<&str>,
    password: Option<&str>,
) -> Result<serde_json::Value, ApiError> {
    let (token, password) = match (
        token.filter(|s| !s.is_empty()),
        password.filter(|s| !s.is_empty()),
    ) {
        (Some(t), Some(p)) => (t, p),
        _ => return Err(ApiError::new(400, codes::MISSING_FIELD, None)),
    };

    if password.len() < 8 {
        return Err(ApiError::new(400, codes::PASSWORD_TOO_SHORT, None));
    }

    let user_id: Option<String> = sqlx::query_scalar(
        r#"
        SELECT id FROM users
        WHERE "passwordResetToken" = $1 AND "passwordResetExpires" > NOW()
        LIMIT 1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let Some(user_id) = user_id else {
        return Err(ApiError::new(
            400,
            codes::PASSWORD_RESET_TOKEN_INVALID,
            None,
        ));
    };

    let password_hash =
        bcrypt::hash(password, 12).map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(
        r#"
        UPDATE users
        SET "passwordHash" = $1, "passwordResetToken" = NULL, "passwordResetExpires" = NULL
        WHERE id = $2
        "#,
    )
    .bind(&password_hash)
    .bind(&user_id)
    .execute(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(serde_json::json!({ "success": true }))
}

pub use crate::ops::face::EnrollFaceResult;

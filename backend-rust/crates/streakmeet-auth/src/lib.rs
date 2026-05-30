mod jwt;
mod models;

pub use jwt::{issue_access_token, verify_access_token, JwtClaims};
pub use models::{
    AuthResponseJson, AuthUserJson, DeletedAccountBody, UserRow, ACCOUNT_RETENTION_DAYS,
};

use models::{deleted_account_error, is_retention_expired, AuthResponseJson as ResponseJson};
use sqlx::PgPool;
use streakmeet_proto::{AuthUser, LoginResponse};
use streakmeet_types::{codes, ApiError};

pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expires_in: String,
}

impl Clone for AuthConfig {
    fn clone(&self) -> Self {
        Self {
            jwt_secret: self.jwt_secret.clone(),
            jwt_expires_in: self.jwt_expires_in.clone(),
        }
    }
}

pub async fn find_user_by_email(pool: &PgPool, email: &str) -> Result<Option<UserRow>, ApiError> {
    let normalized = email.to_lowercase();
    sqlx::query_as::<_, UserRow>(
        r#"
        SELECT
            id, email, "passwordHash", nickname, "qrCodeId", "gemsBalance",
            "faceEnrolled", "emailVerifiedAt", "avatarUrl", timezone,
            "isPublic", "notifyFriends", "notifyMeet", "geoOnPhotos", "deletedAt"
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
        "#,
    )
    .bind(&normalized)
    .fetch_optional(pool)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
}

async fn sync_timezone(pool: &PgPool, user_id: &str, timezone: Option<&str>) {
    let Some(tz) = timezone.filter(|t| is_valid_timezone(t)) else {
        return;
    };
    let _ = sqlx::query(r#"UPDATE users SET timezone = $1 WHERE id = $2"#)
        .bind(tz)
        .bind(user_id)
        .execute(pool)
        .await;
}

fn is_valid_timezone(tz: &str) -> bool {
    !tz.is_empty() && tz.len() <= 64 && tz.chars().all(|c| c.is_ascii() && !c.is_whitespace())
}

pub async fn login(
    pool: &PgPool,
    config: &AuthConfig,
    email: &str,
    password: &str,
    timezone: Option<&str>,
) -> Result<ResponseJson, ApiError> {
    if email.trim().is_empty() || password.is_empty() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    let user = find_user_by_email(pool, email)
        .await?
        .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?;

    if user.password_hash.is_empty() {
        return Err(ApiError::new(401, codes::INVALID_CREDENTIALS, None));
    }

    let valid = bcrypt::verify(password, &user.password_hash)
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    if !valid {
        return Err(ApiError::new(401, codes::INVALID_CREDENTIALS, None));
    }

    if let Some(deleted_at) = user.deleted_at {
        if is_retention_expired(deleted_at) {
            return Err(ApiError::new(401, codes::INVALID_CREDENTIALS, None));
        }
        return Err(deleted_account_error(&user));
    }

    sync_timezone(pool, &user.id, timezone).await;

    let access_token = jwt::issue_access_token(&user.id, &config.jwt_secret, &config.jwt_expires_in)?;

    Ok(ResponseJson {
        access_token,
        user: models::AuthUserJson::from(&user),
    })
}

pub async fn login_proto(
    pool: &PgPool,
    config: &AuthConfig,
    email: &str,
    password: &str,
    timezone: Option<&str>,
) -> Result<LoginResponse, ApiError> {
    let json = login(pool, config, email, password, timezone).await?;
    let u = &json.user;
    Ok(LoginResponse {
        access_token: json.access_token,
        user: Some(AuthUser {
            id: u.id.clone(),
            email: u.email.clone(),
            nickname: u.nickname.clone(),
            qr_code_id: u.qr_code_id.clone(),
            gems_balance: u.gems_balance,
            face_enrolled: u.face_enrolled,
            email_verified: u.email_verified,
            avatar_url: u.avatar_url.clone().unwrap_or_default(),
            timezone: u.timezone.clone(),
            is_public: u.is_public,
            notify_friends: u.notify_friends,
            notify_meet: u.notify_meet,
            geo_on_photos: u.geo_on_photos,
        }),
    })
}

pub fn config_from_env() -> AuthConfig {
    AuthConfig {
        jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "change_me_in_production".into()),
        jwt_expires_in: std::env::var("JWT_EXPIRES_IN").unwrap_or_else(|_| "7d".into()),
    }
}

mod jwt;
mod models;
mod ops;
mod token;
mod verification;

pub use jwt::{JwtClaims, issue_access_token, verify_access_token};
pub use models::{
    ACCOUNT_RETENTION_DAYS, AuthResponseJson, AuthUserJson, DeletedAccountBody, UserRow,
};
pub use ops::account;
pub use ops::credentials::{RegisterInput, check_email, register};
pub use ops::face::enroll_face;
pub use ops::oauth::{RestoreAccountInput, apple_login, google_login, restore_account};
pub use token::{AuthTokenResult, build_auth_response, verify_auth_token};
pub use verification::{
    EnrollFaceResult, forgot_password, issue_email_verification, resend_verification,
    reset_password, verify_email_and_get_redirect, verify_email_with_token,
};

use models::{AuthResponseJson as ResponseJson, deleted_account_error, is_retention_expired};
use sqlx::PgPool;
use streakmeet_proto::{AuthUser, LoginResponse};
use streakmeet_types::{ApiError, codes};

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
    let normalized = email.to_lowercase().trim().to_string();
    let sql = format!(
        r#"SELECT {} FROM users WHERE LOWER(email) = $1 LIMIT 1"#,
        ops::account::USER_PROFILE_SELECT
    );
    sqlx::query_as::<_, UserRow>(&sql)
        .bind(&normalized)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))
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
            ops::account::purge_user(pool, &user.id).await?;
            return Err(ApiError::new(401, codes::INVALID_CREDENTIALS, None));
        }
        return Err(deleted_account_error(&user));
    }

    ops::account::sync_timezone(pool, &user.id, timezone).await;

    build_auth_response(&user, config)
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
        jwt_secret: std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "change_me_in_production".into()),
        jwt_expires_in: std::env::var("JWT_EXPIRES_IN").unwrap_or_else(|_| "7d".into()),
    }
}

#[cfg(test)]
mod login_db_tests {
    use super::*;

    #[tokio::test]
    async fn load_verified_user_row() {
        dotenvy::dotenv().ok();
        let pool = streakmeet_db::connect_from_env().await.expect("db");
        let user = find_user_by_email(&pool, "t31780184815@test.local")
            .await
            .expect("query")
            .expect("user");
        eprintln!(
            "deleted_at={:?} verified={:?} ph_len={} ph_prefix={}",
            user.deleted_at,
            user.email_verified_at,
            user.password_hash.len(),
            &user.password_hash[..10.min(user.password_hash.len())]
        );
        assert!(user.email_verified_at.is_some());
        assert!(user.deleted_at.is_none());
        assert!(bcrypt::verify("test123456", &user.password_hash).unwrap());
    }
}

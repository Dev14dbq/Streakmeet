//! JWT verification with DB check — parity with `backend/src/auth/token.ts`.

use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::PgPool;

use crate::jwt;
use crate::models::{is_email_verified, UserRow};

#[derive(Debug)]
pub enum AuthTokenResult {
    Ok {
        user_id: String,
        email_verified: bool,
    },
    Invalid,
    Deleted {
        email: String,
        deleted_at: DateTime<Utc>,
    },
}

#[derive(Debug, sqlx::FromRow)]
struct AuthCheckRow {
    deleted_at: Option<NaiveDateTime>,
    email: String,
    email_verified_at: Option<NaiveDateTime>,
    password_hash: String,
}

pub async fn verify_auth_token(
    pool: &PgPool,
    token: &str,
    secret: &str,
) -> AuthTokenResult {
    let user_id = match jwt::verify_access_token(token, secret) {
        Ok(id) => id,
        Err(_) => return AuthTokenResult::Invalid,
    };

    let row = sqlx::query_as::<_, AuthCheckRow>(
        r#"
        SELECT
            "deletedAt" AS deleted_at,
            email,
            "emailVerifiedAt" AS email_verified_at,
            "passwordHash" AS password_hash
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(&user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let Some(row) = row else {
        return AuthTokenResult::Invalid;
    };

    if let Some(deleted_at) = row.deleted_at {
        return AuthTokenResult::Deleted {
            email: row.email,
            deleted_at: deleted_at.and_utc(),
        };
    }

    let pseudo_user = UserRow {
        id: user_id.clone(),
        email: row.email,
        password_hash: row.password_hash,
        nickname: String::new(),
        qr_code_id: String::new(),
        gems_balance: 0,
        face_enrolled: false,
        email_verified_at: row.email_verified_at,
        avatar_url: None,
        timezone: String::new(),
        is_public: true,
        notify_friends: true,
        notify_meet: true,
        geo_on_photos: true,
        deleted_at: None,
    };

    AuthTokenResult::Ok {
        user_id,
        email_verified: is_email_verified(&pseudo_user),
    }
}

pub fn build_auth_response(
    user: &UserRow,
    config: &crate::AuthConfig,
) -> Result<crate::models::AuthResponseJson, streakmeet_types::ApiError> {
    let access_token =
        jwt::issue_access_token(&user.id, &config.jwt_secret, &config.jwt_expires_in)?;
    Ok(crate::models::AuthResponseJson {
        access_token,
        user: crate::models::AuthUserJson::from(user),
    })
}

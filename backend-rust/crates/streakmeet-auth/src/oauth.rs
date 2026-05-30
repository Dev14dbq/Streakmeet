//! OAuth login — parity with `backend/src/auth/oauth.ts`.

use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use streakmeet_types::{codes, ApiError};

use crate::account::{
    assert_not_deleted_account, load_full_user, restore_deleted_user, USER_PROFILE_SELECT,
};
use crate::credentials::find_or_create_oauth_user;
use crate::models::{is_retention_expired, AuthResponseJson, UserRow};
use crate::token::build_auth_response;
use crate::AuthConfig;

struct GoogleProfile {
    email: String,
    name: Option<String>,
}

async fn resolve_google_profile(
    access_token: Option<&str>,
    id_token: Option<&str>,
) -> Result<GoogleProfile, ApiError> {
    if access_token.is_none() && id_token.is_none() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let client = Client::new();

    if let Some(id_token) = id_token {
        let url = format!(
            "https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        );
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|_| oauth_invalid())?;

        if !resp.status().is_success() {
            return Err(oauth_invalid());
        }

        #[derive(Deserialize)]
        struct TokenInfo {
            email: Option<String>,
            name: Option<String>,
            aud: Option<String>,
        }

        let info: TokenInfo = resp
            .json()
            .await
            .map_err(|_| oauth_invalid())?;

        if info.aud.as_deref() != Some(client_id.as_str()) {
            return Err(oauth_invalid());
        }

        let email = info.email.ok_or_else(|| oauth_invalid())?;
        return Ok(GoogleProfile {
            email,
            name: info.name,
        });
    }

    let access_token = access_token.unwrap();
    let resp = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|_| oauth_invalid())?;

    if !resp.status().is_success() {
        return Err(oauth_invalid());
    }

    #[derive(Deserialize)]
    struct UserInfo {
        email: Option<String>,
        name: Option<String>,
    }

    let info: UserInfo = resp.json().await.map_err(|_| oauth_invalid())?;
    let email = info.email.ok_or_else(|| oauth_invalid())?;
    Ok(GoogleProfile {
        email,
        name: info.name,
    })
}

fn oauth_invalid() -> ApiError {
    ApiError::new(401, codes::OAUTH_INVALID_TOKEN, None)
}

#[derive(Debug, Deserialize)]
struct AppleKey {
    kid: String,
    n: String,
    e: String,
    kty: String,
}

#[derive(Debug, Deserialize)]
struct AppleKeysResponse {
    keys: Vec<AppleKey>,
}

#[derive(Debug, Deserialize)]
struct AppleClaims {
    email: Option<String>,
}

async fn verify_apple_id_token(id_token: &str) -> Result<AppleClaims, ApiError> {
    use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

    let client_id = std::env::var("APPLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let header = decode_header(id_token).map_err(|_| oauth_invalid())?;
    let kid = header.kid.ok_or_else(|| oauth_invalid())?;

    let client = Client::new();
    let keys: AppleKeysResponse = client
        .get("https://appleid.apple.com/auth/keys")
        .send()
        .await
        .map_err(|_| oauth_invalid())?
        .json()
        .await
        .map_err(|_| oauth_invalid())?;

    let key = keys
        .keys
        .into_iter()
        .find(|k| k.kid == kid && k.kty == "RSA")
        .ok_or_else(|| oauth_invalid())?;

    let decoding_key =
        DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| oauth_invalid())?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id.as_str()]);
    validation.set_issuer(&["https://appleid.apple.com"]);

    let data = decode::<AppleClaims>(id_token, &decoding_key, &validation)
        .map_err(|_| oauth_invalid())?;

    Ok(data.claims)
}

async fn run_oauth_login(
    pool: &PgPool,
    config: &AuthConfig,
    resolve_profile: impl std::future::Future<Output = Result<(String, Option<String>), ApiError>>,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    let (email, _display_name) = resolve_profile.await?;
    let user = find_or_create_oauth_user(pool, &email, timezone).await?;
    assert_not_deleted_account(pool, &user).await?;
    let full = load_full_user(pool, &user.id)
        .await?
        .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?;
    build_auth_response(&full, config)
}

pub async fn google_login(
    pool: &PgPool,
    config: &AuthConfig,
    access_token: Option<&str>,
    id_token: Option<&str>,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    if access_token.is_none() && id_token.is_none() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    if std::env::var("GOOGLE_CLIENT_ID").is_err() {
        return Err(ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None));
    }

    let profile = resolve_google_profile(access_token, id_token).await;
    match profile {
        Ok(p) => {
            run_oauth_login(
                pool,
                config,
                async move { Ok((p.email, p.name)) },
                timezone,
            )
            .await
        }
        Err(e) if e.body.code == codes::OAUTH_NOT_CONFIGURED || e.body.code == codes::MISSING_FIELD => {
            Err(e)
        }
        Err(_) => Err(oauth_invalid()),
    }
}

pub async fn apple_login(
    pool: &PgPool,
    config: &AuthConfig,
    id_token: Option<&str>,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    let id_token = id_token.filter(|s| !s.is_empty()).ok_or_else(|| {
        ApiError::new(400, codes::MISSING_FIELD, None)
    })?;

    if std::env::var("APPLE_CLIENT_ID").is_err() {
        return Err(ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None));
    }

    let token = id_token.to_string();
    run_oauth_login(
        pool,
        config,
        async move {
            let claims = verify_apple_id_token(&token).await?;
            let email = claims
                .email
                .ok_or_else(|| ApiError::new(401, codes::OAUTH_INVALID_TOKEN, None))?;
            Ok((email, None))
        },
        timezone,
    )
    .await
}

pub struct RestoreAccountInput<'a> {
    pub email: Option<&'a str>,
    pub password: Option<&'a str>,
    pub provider: Option<&'a str>,
    pub access_token: Option<&'a str>,
    pub id_token: Option<&'a str>,
}

pub async fn restore_account(
    pool: &PgPool,
    config: &AuthConfig,
    input: RestoreAccountInput<'_>,
) -> Result<AuthResponseJson, ApiError> {
    let result = restore_account_inner(pool, config, input).await;
    match result {
        Ok(r) => Ok(r),
        Err(e) if is_auth_service_error(&e) => Err(e),
        Err(_) => Err(ApiError::new(401, codes::RESTORE_ACCOUNT_FAILED, None)),
    }
}

fn is_auth_service_error(e: &ApiError) -> bool {
    matches!(
        e.body.code.as_str(),
        codes::MISSING_FIELD
            | codes::INVALID_CREDENTIALS
            | codes::ACCOUNT_RETENTION_EXPIRED
            | codes::OAUTH_NOT_CONFIGURED
            | codes::OAUTH_INVALID_TOKEN
    )
}

async fn restore_account_inner(
    pool: &PgPool,
    config: &AuthConfig,
    input: RestoreAccountInput<'_>,
) -> Result<AuthResponseJson, ApiError> {
    let provider = input.provider;

    if provider == Some("google") {
        if input.access_token.is_none() && input.id_token.is_none() {
            return Err(ApiError::new(400, codes::MISSING_FIELD, None));
        }
        let profile = resolve_google_profile(input.access_token, input.id_token).await?;
        return restore_by_email(pool, config, &profile.email, true).await;
    }

    if provider == Some("apple") {
        let id_token = input
            .id_token
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
        let claims = verify_apple_id_token(id_token).await?;
        let email = claims
            .email
            .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?;
        return restore_by_email(pool, config, &email, true).await;
    }

    let email = input
        .email
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
    let password = input
        .password
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;

    let user = crate::find_user_by_email(pool, email)
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

    if user.deleted_at.is_none() {
        return build_auth_response(&user, config);
    }

    let deleted_at = user.deleted_at.unwrap();
    if is_retention_expired(deleted_at) {
        crate::account::purge_user(pool, &user.id).await?;
        return Err(ApiError::new(410, codes::ACCOUNT_RETENTION_EXPIRED, None));
    }

    let restored = restore_deleted_user(pool, &user.id, false).await?;
    build_auth_response(&restored, config)
}

async fn restore_by_email(
    pool: &PgPool,
    config: &AuthConfig,
    email: &str,
    oauth_verified: bool,
) -> Result<AuthResponseJson, ApiError> {
    let user = crate::find_user_by_email(pool, email)
        .await?
        .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?;

    if user.deleted_at.is_none() {
        let full = load_full_user(pool, &user.id)
            .await?
            .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?;
        return build_auth_response(&full, config);
    }

    let deleted_at = user.deleted_at.unwrap();
    if is_retention_expired(deleted_at) {
        crate::account::purge_user(pool, &user.id).await?;
        return Err(ApiError::new(410, codes::ACCOUNT_RETENTION_EXPIRED, None));
    }

    let restored = restore_deleted_user(pool, &user.id, oauth_verified).await?;
    build_auth_response(&restored, config)
}

//! OAuth login — parity with `backend/src/auth/oauth.ts`.

use std::collections::HashMap;

use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use streakmeet_types::{ApiError, codes};

use crate::AuthConfig;
use crate::models::{AuthResponseJson, is_retention_expired};
use crate::oauth_state::{issue_apple_oauth_state, issue_apple_session, verify_apple_oauth_state, verify_apple_session};
use crate::ops::account::{assert_not_deleted_account, load_full_user, restore_deleted_user};
use crate::ops::credentials::find_or_create_oauth_user;
use crate::token::build_auth_response;

struct GoogleProfile {
    email: String,
    name: Option<String>,
}

async fn resolve_google_profile(
    access_token: Option<&str>,
    id_token: Option<&str>,
    expected_nonce: Option<&str>,
) -> Result<GoogleProfile, ApiError> {
    if access_token.is_none() && id_token.is_none() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let client = Client::new();

    if let Some(id_token) = id_token {
        let url = format!("https://oauth2.googleapis.com/tokeninfo?id_token={id_token}");
        let resp = client.get(&url).send().await.map_err(|_| oauth_invalid())?;

        if !resp.status().is_success() {
            return Err(oauth_invalid());
        }

        #[derive(Deserialize)]
        struct TokenInfo {
            email: Option<String>,
            name: Option<String>,
            aud: Option<String>,
            nonce: Option<String>,
        }

        let info: TokenInfo = resp.json().await.map_err(|_| oauth_invalid())?;

        if info.aud.as_deref() != Some(client_id.as_str()) {
            return Err(oauth_invalid());
        }

        if let Some(expected_nonce) = expected_nonce {
            if info.nonce.as_deref() != Some(expected_nonce) {
                return Err(oauth_invalid());
            }
        }

        let email = info.email.ok_or_else(oauth_invalid)?;
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
    let email = info.email.ok_or_else(oauth_invalid)?;
    Ok(GoogleProfile {
        email,
        name: info.name,
    })
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: Option<String>,
    id_token: Option<String>,
}

async fn exchange_google_authorization_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<(Option<String>, Option<String>), ApiError> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let client = Client::new();
    let mut form = HashMap::from([
        ("code".to_string(), code.to_string()),
        ("client_id".to_string(), client_id),
        ("redirect_uri".to_string(), redirect_uri.to_string()),
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code_verifier".to_string(), code_verifier.to_string()),
    ]);

    if let Ok(secret) = std::env::var("GOOGLE_CLIENT_SECRET") {
        if !secret.is_empty() {
            form.insert("client_secret".to_string(), secret);
        }
    }

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|_| oauth_invalid())?;

    if !resp.status().is_success() {
        return Err(oauth_invalid());
    }

    let tokens: GoogleTokenResponse = resp.json().await.map_err(|_| oauth_invalid())?;
    if tokens.id_token.is_none() && tokens.access_token.is_none() {
        return Err(oauth_invalid());
    }

    Ok((tokens.access_token, tokens.id_token))
}

fn oauth_invalid() -> ApiError {
    ApiError::new(401, codes::OAUTH_INVALID_TOKEN, None)
}

fn app_public_url() -> Result<String, ApiError> {
    std::env::var("APP_PUBLIC_URL")
        .map(|s| s.trim_end_matches('/').to_string())
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))
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
    nonce: Option<String>,
}

async fn verify_apple_id_token(
    id_token: &str,
    expected_nonce: Option<&str>,
) -> Result<AppleClaims, ApiError> {
    use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};

    let client_id = std::env::var("APPLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let header = decode_header(id_token).map_err(|_| oauth_invalid())?;
    let kid = header.kid.ok_or_else(oauth_invalid)?;

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
        .ok_or_else(oauth_invalid)?;

    let decoding_key =
        DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| oauth_invalid())?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id.as_str()]);
    validation.set_issuer(&["https://appleid.apple.com"]);

    let data =
        decode::<AppleClaims>(id_token, &decoding_key, &validation).map_err(|_| oauth_invalid())?;

    if let Some(expected_nonce) = expected_nonce {
        if data.claims.nonce.as_deref() != Some(expected_nonce) {
            return Err(oauth_invalid());
        }
    }

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

pub struct GoogleLoginInput<'a> {
    pub access_token: Option<&'a str>,
    pub id_token: Option<&'a str>,
    pub code: Option<&'a str>,
    pub code_verifier: Option<&'a str>,
    pub redirect_uri: Option<&'a str>,
    pub timezone: Option<&'a str>,
}

pub async fn google_login(
    pool: &PgPool,
    config: &AuthConfig,
    input: GoogleLoginInput<'_>,
) -> Result<AuthResponseJson, ApiError> {
    if std::env::var("GOOGLE_CLIENT_ID").is_err() {
        return Err(ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None));
    }

    let (access_token, id_token) = if let Some(code) = input.code.filter(|s| !s.is_empty()) {
        let verifier = input
            .code_verifier
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
        let redirect_uri = input
            .redirect_uri
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
        exchange_google_authorization_code(code, verifier, redirect_uri).await?
    } else {
        (
            input.access_token.map(str::to_string),
            input.id_token.map(str::to_string),
        )
    };

    if access_token.is_none() && id_token.is_none() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }

    let access_ref = access_token.as_deref();
    let id_ref = id_token.as_deref();
    let profile = resolve_google_profile(access_ref, id_ref, None).await?;
    run_oauth_login(pool, config, async move { Ok((profile.email, profile.name)) }, input.timezone)
        .await
}

pub async fn apple_login(
    pool: &PgPool,
    config: &AuthConfig,
    id_token: Option<&str>,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    let id_token = id_token
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;

    if std::env::var("APPLE_CLIENT_ID").is_err() {
        return Err(ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None));
    }

    let token = id_token.to_string();
    run_oauth_login(
        pool,
        config,
        async move {
            let claims = verify_apple_id_token(&token, None).await?;
            let email = claims
                .email
                .ok_or_else(|| ApiError::new(401, codes::OAUTH_INVALID_TOKEN, None))?;
            Ok((email, None))
        },
        timezone,
    )
    .await
}

pub async fn apple_login_with_email(
    pool: &PgPool,
    config: &AuthConfig,
    email: &str,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    if email.trim().is_empty() {
        return Err(ApiError::new(400, codes::MISSING_FIELD, None));
    }
    run_oauth_login(
        pool,
        config,
        async move { Ok((email.to_string(), None)) },
        timezone,
    )
    .await
}

pub fn build_apple_authorize_url(config: &AuthConfig, return_to: &str) -> Result<String, ApiError> {
    let client_id = std::env::var("APPLE_CLIENT_ID")
        .map_err(|_| ApiError::new(503, codes::OAUTH_NOT_CONFIGURED, None))?;

    let return_to = sanitize_return_to(return_to)?;
    let nonce = uuid::Uuid::new_v4().to_string();
    let state = issue_apple_oauth_state(config, &return_to, &nonce)?;
    let redirect_uri = format!("{}/api/auth/apple/callback", app_public_url()?);

    let params = [
        ("client_id", client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code id_token"),
        ("scope", "email name"),
        ("response_mode", "form_post"),
        ("state", state.as_str()),
        ("nonce", nonce.as_str()),
    ];
    let query = params
        .into_iter()
        .map(|(k, v)| format!("{k}={}", percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    Ok(format!("https://appleid.apple.com/auth/authorize?{query}"))
}

pub struct AppleCallbackInput<'a> {
    pub state: Option<&'a str>,
    pub id_token: Option<&'a str>,
    pub error: Option<&'a str>,
}

pub async fn process_apple_callback(
    config: &AuthConfig,
    input: AppleCallbackInput<'_>,
) -> Result<(String, String), ApiError> {
    if input.error.is_some() {
        return Err(oauth_invalid());
    }

    let state = input
        .state
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
    let id_token = input
        .id_token
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;

    let (return_to, nonce) = verify_apple_oauth_state(config, state)?;
    let claims = verify_apple_id_token(id_token, Some(&nonce)).await?;

    let email = claims
        .email
        .ok_or_else(|| ApiError::new(401, codes::OAUTH_INVALID_TOKEN, None))?;

    let session = issue_apple_session(config, &email)?;
    Ok((return_to, session))
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

pub async fn exchange_apple_session(
    pool: &PgPool,
    config: &AuthConfig,
    session_token: &str,
    timezone: Option<&str>,
) -> Result<AuthResponseJson, ApiError> {
    let email = verify_apple_session(config, session_token)?;
    apple_login_with_email(pool, config, &email, timezone).await
}

fn sanitize_return_to(return_to: &str) -> Result<String, ApiError> {
    let trimmed = return_to.trim();
    if trimmed.is_empty() {
        return app_public_url();
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err(oauth_invalid());
    }
    Ok(trimmed.trim_end_matches('/').to_string())
}

pub struct RestoreAccountInput<'a> {
    pub email: Option<&'a str>,
    pub password: Option<&'a str>,
    pub provider: Option<&'a str>,
    pub access_token: Option<&'a str>,
    pub id_token: Option<&'a str>,
    pub code: Option<&'a str>,
    pub code_verifier: Option<&'a str>,
    pub redirect_uri: Option<&'a str>,
    pub session_token: Option<&'a str>,
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
        let profile = if let Some(code) = input.code.filter(|s| !s.is_empty()) {
            let verifier = input
                .code_verifier
                .filter(|s| !s.is_empty())
                .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
            let redirect_uri = input
                .redirect_uri
                .filter(|s| !s.is_empty())
                .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
            let (access_token, id_token) =
                exchange_google_authorization_code(code, verifier, redirect_uri).await?;
            resolve_google_profile(
                access_token.as_deref(),
                id_token.as_deref(),
                None,
            )
            .await?
        } else {
            if input.access_token.is_none() && input.id_token.is_none() {
                return Err(ApiError::new(400, codes::MISSING_FIELD, None));
            }
            resolve_google_profile(input.access_token, input.id_token, None).await?
        };
        return restore_by_email(pool, config, &profile.email, true).await;
    }

    if provider == Some("apple") {
        let email = if let Some(session) = input.session_token.filter(|s| !s.is_empty()) {
            verify_apple_session(config, session)?
        } else {
            let id_token = input
                .id_token
                .filter(|s| !s.is_empty())
                .ok_or_else(|| ApiError::new(400, codes::MISSING_FIELD, None))?;
            let claims = verify_apple_id_token(id_token, None).await?;
            claims
                .email
                .ok_or_else(|| ApiError::new(401, codes::INVALID_CREDENTIALS, None))?
        };
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

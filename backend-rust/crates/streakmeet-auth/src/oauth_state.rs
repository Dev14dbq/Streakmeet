//! Short-lived signed JWTs for OAuth state and one-time session handoff.

use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use streakmeet_types::ApiError;

use crate::AuthConfig;

const STATE_TTL_SECS: i64 = 600;
const SESSION_TTL_SECS: i64 = 300;

#[derive(Debug, Serialize, Deserialize)]
struct AppleOAuthStateClaims {
    #[serde(rename = "typ")]
    typ: String,
    return_to: String,
    nonce: String,
    exp: i64,
    iat: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppleSessionClaims {
    #[serde(rename = "typ")]
    typ: String,
    email: String,
    exp: i64,
    iat: i64,
}

fn oauth_state_invalid() -> ApiError {
    ApiError::new(401, streakmeet_types::codes::OAUTH_INVALID_TOKEN, None)
}

pub fn issue_apple_oauth_state(
    config: &AuthConfig,
    return_to: &str,
    nonce: &str,
) -> Result<String, ApiError> {
    let now = chrono::Utc::now().timestamp();
    let claims = AppleOAuthStateClaims {
        typ: "apple_oauth_state".into(),
        return_to: return_to.to_string(),
        nonce: nonce.to_string(),
        exp: now + STATE_TTL_SECS,
        iat: now,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|_| ApiError::new(500, streakmeet_types::codes::INTERNAL_ERROR, None))
}

pub fn verify_apple_oauth_state(config: &AuthConfig, token: &str) -> Result<(String, String), ApiError> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    let data = decode::<AppleOAuthStateClaims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| oauth_state_invalid())?;

    if data.claims.typ != "apple_oauth_state" {
        return Err(oauth_state_invalid());
    }

    Ok((data.claims.return_to, data.claims.nonce))
}

pub fn issue_apple_session(config: &AuthConfig, email: &str) -> Result<String, ApiError> {
    let now = chrono::Utc::now().timestamp();
    let claims = AppleSessionClaims {
        typ: "apple_oauth_session".into(),
        email: email.to_string(),
        exp: now + SESSION_TTL_SECS,
        iat: now,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|_| ApiError::new(500, streakmeet_types::codes::INTERNAL_ERROR, None))
}

pub fn verify_apple_session(config: &AuthConfig, token: &str) -> Result<String, ApiError> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    let data = decode::<AppleSessionClaims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| oauth_state_invalid())?;

    if data.claims.typ != "apple_oauth_session" {
        return Err(oauth_state_invalid());
    }

    Ok(data.claims.email)
}

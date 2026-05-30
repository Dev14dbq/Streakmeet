//! JWT helpers — parity with `backend/src/auth/token.ts` (HS256, `{ sub: userId }`).

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use streakmeet_types::ApiError;

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub exp: i64,
    pub iat: i64,
}

pub fn issue_access_token(user_id: &str, secret: &str, expires_in: &str) -> Result<String, ApiError> {
    let now = chrono::Utc::now().timestamp();
    let exp = now + parse_duration_secs(expires_in);
    let claims = JwtClaims {
        sub: user_id.to_string(),
        exp,
        iat: now,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| ApiError::new(500, streakmeet_types::codes::INTERNAL_ERROR, None))
}

pub fn verify_access_token(token: &str, secret: &str) -> Result<String, ApiError> {
    let data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::new(401, streakmeet_types::codes::INVALID_TOKEN, None))?;
    Ok(data.claims.sub)
}

/// Parses `7d`, `24h`, `3600` (seconds) — matches common Node JWT_EXPIRES_IN values.
fn parse_duration_secs(raw: &str) -> i64 {
    let raw = raw.trim();
    if let Some(days) = raw.strip_suffix('d') {
        return days.parse::<i64>().unwrap_or(7) * 86_400;
    }
    if let Some(hours) = raw.strip_suffix('h') {
        return hours.parse::<i64>().unwrap_or(24) * 3_600;
    }
    if let Some(mins) = raw.strip_suffix('m') {
        return mins.parse::<i64>().unwrap_or(60) * 60;
    }
    raw.parse::<i64>().unwrap_or(604_800)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_7d() {
        assert_eq!(parse_duration_secs("7d"), 604_800);
    }
}

//! Shared types and error codes — parity with `backend/src/common/errors.ts`.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Machine-readable API error codes (1:1 with Node `ErrorCodes`).
pub mod codes {
    pub const UNAUTHORIZED: &str = "UNAUTHORIZED";
    pub const INVALID_TOKEN: &str = "INVALID_TOKEN";
    pub const INVALID_CREDENTIALS: &str = "INVALID_CREDENTIALS";
    pub const ACCOUNT_DELETED: &str = "ACCOUNT_DELETED";
    pub const ACCOUNT_RETENTION_EXPIRED: &str = "ACCOUNT_RETENTION_EXPIRED";
    pub const OAUTH_INVALID_TOKEN: &str = "OAUTH_INVALID_TOKEN";
    pub const OAUTH_NOT_CONFIGURED: &str = "OAUTH_NOT_CONFIGURED";
    pub const RESTORE_ACCOUNT_FAILED: &str = "RESTORE_ACCOUNT_FAILED";
    pub const EMAIL_NOT_VERIFIED: &str = "EMAIL_NOT_VERIFIED";
    pub const EMAIL_VERIFY_TOKEN_INVALID: &str = "EMAIL_VERIFY_TOKEN_INVALID";
    pub const PASSWORD_RESET_TOKEN_INVALID: &str = "PASSWORD_RESET_TOKEN_INVALID";
    pub const RESEND_COOLDOWN: &str = "RESEND_COOLDOWN";
    pub const EMAIL_SEND_FAILED: &str = "EMAIL_SEND_FAILED";
    pub const OAUTH_ACCOUNT_NO_PASSWORD: &str = "OAUTH_ACCOUNT_NO_PASSWORD";
    pub const MISSING_FIELD: &str = "MISSING_FIELD";
    pub const INVALID_EMAIL: &str = "INVALID_EMAIL";
    pub const INVALID_TIMEZONE: &str = "INVALID_TIMEZONE";
    pub const INVALID_PHOTO: &str = "INVALID_PHOTO";
    pub const INVALID_COORDINATES: &str = "INVALID_COORDINATES";
    pub const INVALID_USERNAME: &str = "INVALID_USERNAME";
    pub const PASSWORD_TOO_SHORT: &str = "PASSWORD_TOO_SHORT";
    pub const INVALID_BOOLEAN: &str = "INVALID_BOOLEAN";
    pub const PHOTOS_REQUIRED: &str = "PHOTOS_REQUIRED";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const USER_NOT_FOUND: &str = "USER_NOT_FOUND";
    pub const STREAK_NOT_FOUND: &str = "STREAK_NOT_FOUND";
    pub const FRIENDSHIP_NOT_FOUND: &str = "FRIENDSHIP_NOT_FOUND";
    pub const REMOTE_SELFIE_NOT_FOUND: &str = "REMOTE_SELFIE_NOT_FOUND";
    pub const LEGAL_DOCUMENT_NOT_FOUND: &str = "LEGAL_DOCUMENT_NOT_FOUND";
    pub const EMAIL_ALREADY_IN_USE: &str = "EMAIL_ALREADY_IN_USE";
    pub const USERNAME_TAKEN: &str = "USERNAME_TAKEN";
    pub const FRIENDSHIP_EXISTS: &str = "FRIENDSHIP_EXISTS";
    pub const STREAK_EXISTS: &str = "STREAK_EXISTS";
    pub const REMOTE_SELFIE_PENDING: &str = "REMOTE_SELFIE_PENDING";
    pub const REMOTE_SELFIE_HANDLED: &str = "REMOTE_SELFIE_HANDLED";
    pub const LOCATION_SHARING_DISABLED: &str = "LOCATION_SHARING_DISABLED";
    pub const DUPLICATE_RECORD: &str = "DUPLICATE_RECORD";
    pub const INVALID_REFERENCE: &str = "INVALID_REFERENCE";
    pub const PRIVATE_PROFILE: &str = "PRIVATE_PROFILE";
    pub const NOT_FRIENDS: &str = "NOT_FRIENDS";
    pub const REMOTE_SELFIE_EXPIRED: &str = "REMOTE_SELFIE_EXPIRED";
    pub const CANNOT_ADD_SELF: &str = "CANNOT_ADD_SELF";
    pub const FACE_NOT_ENROLLED: &str = "FACE_NOT_ENROLLED";
    pub const FACE_LEGACY_EMBEDDING: &str = "FACE_LEGACY_EMBEDDING";
    pub const FACE_NOT_DETECTED: &str = "FACE_NOT_DETECTED";
    pub const FACE_ENROLL_LOW_QUALITY: &str = "FACE_ENROLL_LOW_QUALITY";
    pub const FACE_ENROLL_TOO_FEW_FRAMES: &str = "FACE_ENROLL_TOO_FEW_FRAMES";
    pub const STREAK_ALREADY_MET_TODAY: &str = "STREAK_ALREADY_MET_TODAY";
    pub const FRIENDSHIP_NOT_PENDING: &str = "FRIENDSHIP_NOT_PENDING";
    pub const MAGIC_MEET_PHOTO_REQUIRED: &str = "MAGIC_MEET_PHOTO_REQUIRED";
    pub const MAGIC_MEET_USER_NOT_ON_PHOTO: &str = "MAGIC_MEET_USER_NOT_ON_PHOTO";
    pub const MAGIC_MEET_MIN_FACES: &str = "MAGIC_MEET_MIN_FACES";
    pub const MAGIC_MEET_NO_MATCH: &str = "MAGIC_MEET_NO_MATCH";
    pub const MAGIC_MEET_DUPLICATE_PHOTO: &str = "MAGIC_MEET_DUPLICATE_PHOTO";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    pub const FACE_SERVICE_ERROR: &str = "FACE_SERVICE_ERROR";
    pub const AVATAR_SAVE_FAILED: &str = "AVATAR_SAVE_FAILED";
    pub const IMAGE_COMBINE_FAILED: &str = "IMAGE_COMBINE_FAILED";
    pub const IMAGE_SAVE_FAILED: &str = "IMAGE_SAVE_FAILED";
}

/// Default Russian messages matching Node `DEFAULT_MESSAGES`.
pub fn default_message(code: &str) -> &'static str {
    match code {
        codes::UNAUTHORIZED => "Требуется авторизация",
        codes::INVALID_TOKEN => "Недействительный токен",
        codes::INVALID_CREDENTIALS => "Неверный email или пароль",
        codes::ACCOUNT_DELETED => "Аккаунт удалён — войдите, чтобы восстановить",
        codes::MISSING_FIELD => "Не заполнены обязательные поля",
        codes::INTERNAL_ERROR => "Внутренняя ошибка сервера",
        _ => "Ошибка",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorBody {
    pub error: String,
    pub code: String,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

impl ApiErrorBody {
    pub fn new(code: &str, message: Option<&str>) -> Self {
        Self {
            error: message.unwrap_or(default_message(code)).to_string(),
            code: code.to_string(),
            extra: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: u16,
    pub body: ApiErrorBody,
}

impl ApiError {
    pub fn new(status: u16, code: &str, message: Option<&str>) -> Self {
        Self {
            status,
            body: ApiErrorBody::new(code, message),
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.body.error, self.body.code)
    }
}

impl std::error::Error for ApiError {}

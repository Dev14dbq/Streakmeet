use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use streakmeet_proto::AuthUser;
use streakmeet_types::{codes, ApiError, ApiErrorBody};

pub const ACCOUNT_RETENTION_DAYS: i64 = 30;

#[derive(Debug, Clone, FromRow)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    #[sqlx(rename = "passwordHash")]
    pub password_hash: String,
    pub nickname: String,
    #[sqlx(rename = "qrCodeId")]
    pub qr_code_id: String,
    #[sqlx(rename = "gemsBalance")]
    pub gems_balance: i32,
    #[sqlx(rename = "faceEnrolled")]
    pub face_enrolled: bool,
    #[sqlx(rename = "emailVerifiedAt")]
    pub email_verified_at: Option<DateTime<Utc>>,
    #[sqlx(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    pub timezone: String,
    #[sqlx(rename = "isPublic")]
    pub is_public: bool,
    #[sqlx(rename = "notifyFriends")]
    pub notify_friends: bool,
    #[sqlx(rename = "notifyMeet")]
    pub notify_meet: bool,
    #[sqlx(rename = "geoOnPhotos")]
    pub geo_on_photos: bool,
    #[sqlx(rename = "deletedAt")]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponseJson {
    pub access_token: String,
    pub user: AuthUserJson,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUserJson {
    pub id: String,
    pub email: String,
    pub nickname: String,
    pub qr_code_id: String,
    pub gems_balance: i32,
    pub face_enrolled: bool,
    pub email_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub timezone: String,
    pub is_public: bool,
    pub notify_friends: bool,
    pub notify_meet: bool,
    pub geo_on_photos: bool,
}

impl From<&UserRow> for AuthUserJson {
    fn from(u: &UserRow) -> Self {
        Self {
            id: u.id.clone(),
            email: u.email.clone(),
            nickname: u.nickname.clone(),
            qr_code_id: u.qr_code_id.clone(),
            gems_balance: u.gems_balance,
            face_enrolled: u.face_enrolled,
            email_verified: is_email_verified(u),
            avatar_url: u.avatar_url.clone(),
            timezone: u.timezone.clone(),
            is_public: u.is_public,
            notify_friends: u.notify_friends,
            notify_meet: u.notify_meet,
            geo_on_photos: u.geo_on_photos,
        }
    }
}

impl From<&UserRow> for AuthUser {
    fn from(u: &UserRow) -> Self {
        let json = AuthUserJson::from(u);
        AuthUser {
            id: json.id,
            email: json.email,
            nickname: json.nickname,
            qr_code_id: json.qr_code_id,
            gems_balance: json.gems_balance,
            face_enrolled: json.face_enrolled,
            email_verified: json.email_verified,
            avatar_url: json.avatar_url.unwrap_or_default(),
            timezone: json.timezone,
            is_public: json.is_public,
            notify_friends: json.notify_friends,
            notify_meet: json.notify_meet,
            geo_on_photos: json.geo_on_photos,
        }
    }
}

fn is_oauth_only(password_hash: &str) -> bool {
    password_hash.is_empty()
}

pub fn is_email_verified(user: &UserRow) -> bool {
    if is_oauth_only(&user.password_hash) {
        return true;
    }
    user.email_verified_at.is_some()
}

pub fn is_retention_expired(deleted_at: DateTime<Utc>) -> bool {
    let retention_ms = ACCOUNT_RETENTION_DAYS * 86_400;
    (Utc::now() - deleted_at).num_seconds() > retention_ms
}

pub fn days_remaining(deleted_at: DateTime<Utc>) -> i32 {
    let retention_secs = ACCOUNT_RETENTION_DAYS * 86_400;
    let elapsed = (Utc::now() - deleted_at).num_seconds();
    ((retention_secs - elapsed).max(0) / 86_400) as i32
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedAccountBody {
    pub error: String,
    pub code: String,
    pub email: String,
    pub deleted_at: String,
    pub days_remaining: i32,
}

impl DeletedAccountBody {
    pub fn from_user(user: &UserRow) -> Self {
        let deleted_at = user.deleted_at.expect("deleted account");
        Self {
            error: "Аккаунт удалён — войдите, чтобы восстановить".into(),
            code: codes::ACCOUNT_DELETED.into(),
            email: user.email.clone(),
            deleted_at: deleted_at.to_rfc3339(),
            days_remaining: days_remaining(deleted_at),
        }
    }
}

pub fn deleted_account_error(user: &UserRow) -> ApiError {
    ApiError {
        status: 403,
        body: ApiErrorBody {
            error: DeletedAccountBody::from_user(user).error.clone(),
            code: codes::ACCOUNT_DELETED.into(),
            extra: Some(serde_json::to_value(DeletedAccountBody::from_user(user)).unwrap()),
        },
    }
}

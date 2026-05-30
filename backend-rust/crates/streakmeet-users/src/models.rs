use serde::Deserialize;
use streakmeet_auth::AuthUserJson;

pub type UserProfileJson = AuthUserJson;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileInput {
    pub nickname: Option<String>,
    pub timezone: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchUserJson {
    pub id: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub qr_code_id: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProfileJson {
    pub user: PublicUserJson,
    pub friendship: Option<PublicFriendshipJson>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUserJson {
    pub id: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub is_public: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicFriendshipJson {
    pub id: String,
    pub status: String,
    pub is_incoming: bool,
}

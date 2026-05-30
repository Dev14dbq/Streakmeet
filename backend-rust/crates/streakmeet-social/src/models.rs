use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSummaryJson {
    pub id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendListItemJson {
    pub id: String,
    pub status: String,
    pub is_incoming_request: bool,
    pub friend: UserSummaryJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendshipRecordJson {
    pub id: String,
    pub status: String,
    pub user_a_id: String,
    pub user_b_id: String,
}

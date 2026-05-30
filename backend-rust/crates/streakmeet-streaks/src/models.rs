use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakPartnerJson {
    pub id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakListItemJson {
    pub id: String,
    pub count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub partner: StreakPartnerJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakRecordJson {
    pub id: String,
    pub user_a_id: String,
    pub user_b_id: String,
    pub count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_met_date: Option<String>,
    pub active: bool,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakDetailDayJson {
    pub id: String,
    pub date: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakDetailJson {
    pub id: String,
    pub count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub user_a: StreakPartnerJson,
    pub user_b: StreakPartnerJson,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streak_days: Option<Vec<StreakDetailDayJson>>,
}

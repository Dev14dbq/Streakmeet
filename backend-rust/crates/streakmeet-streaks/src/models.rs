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
    pub lifecycle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count_at_death: Option<i32>,
    pub restores_left: i32,
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
pub struct StreakTaskJson {
    pub id: String,
    pub title_key: String,
    pub points: i32,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakPetProgressJson {
    pub points: i32,
    pub level: i32,
    pub points_in_level: i32,
    pub next_level_points: i32,
    pub points_to_next_level: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakDetailJson {
    pub id: String,
    pub pet_name: String,
    pub count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_met_date: Option<String>,
    pub timezone: String,
    pub pet_progress: StreakPetProgressJson,
    pub daily_tasks: Vec<StreakTaskJson>,
    pub lifecycle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count_at_death: Option<i32>,
    pub restores_left: i32,
    pub user_a: StreakPartnerJson,
    pub user_b: StreakPartnerJson,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streak_days: Option<Vec<StreakDetailDayJson>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStreakPetJson {
    pub id: String,
    pub pet_name: String,
}

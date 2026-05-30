use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyLocationJson {
    pub sharing_location: bool,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendLocationJson {
    pub id: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
    pub updated_at: String,
}

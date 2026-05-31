//! SQL helpers for streak pair queries.

pub fn pair_where_sql(user_a_id: &str, user_b_id: &str) -> (String, String) {
    let clause = r#"(
        ("userAId" = $1 AND "userBId" = $2)
        OR ("userAId" = $2 AND "userBId" = $1)
    )"#
    .to_string();
    (clause, format!("pair:{user_a_id}:{user_b_id}"))
}

pub fn streak_for_user_where_sql(user_id: &str) -> String {
    let _ = user_id;
    r#"("userAId" = $1 OR "userBId" = $1)"#.to_string()
}

pub fn partner_of(
    user_a_id: &str,
    user_b_id: &str,
    user_a_nickname: &str,
    user_a_avatar: Option<&str>,
    user_b_nickname: &str,
    user_b_avatar: Option<&str>,
    viewer_id: &str,
) -> crate::models::StreakPartnerJson {
    if user_a_id == viewer_id {
        crate::models::StreakPartnerJson {
            id: user_b_id.to_string(),
            nickname: user_b_nickname.to_string(),
            avatar_url: user_b_avatar.map(|s| s.to_string()),
        }
    } else {
        crate::models::StreakPartnerJson {
            id: user_a_id.to_string(),
            nickname: user_a_nickname.to_string(),
            avatar_url: user_a_avatar.map(|s| s.to_string()),
        }
    }
}

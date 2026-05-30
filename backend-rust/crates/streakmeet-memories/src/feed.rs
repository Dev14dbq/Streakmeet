//! Memories feed — parity with `backend/src/memories/feed.ts`.

use serde::Serialize;
use sqlx::PgPool;
use streakmeet_streaks::find_streak_for_user;
use streakmeet_types::{codes, ApiError};

use crate::milestones::{compute_milestones_from_met_days, MetDayRow};
use crate::repository::{
    count_met_days_for_user, list_meet_proofs_for_user, list_met_days_for_user,
    load_partner_by_streak_id, max_active_streak_count, partner_from_proof, MeetProofRow,
    MemoryPartner,
};

pub const MEMORIES_MILESTONE_DAYS: [i32; 5] = [7, 14, 30, 50, 100];
pub const MEMORIES_UNLOCK_DAYS: i32 = 7;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPartnerJson {
    pub id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMeetItemJson {
    pub id: String,
    pub kind: &'static str,
    pub date: String,
    pub created_at: String,
    pub streak_id: String,
    pub partner: MemoryPartnerJson,
    pub photo_url: String,
    pub uploaded_by: UploadedByJson,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedByJson {
    pub id: String,
    pub nickname: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMilestoneItemJson {
    pub id: String,
    pub kind: &'static str,
    pub date: String,
    pub streak_id: String,
    pub partner: MemoryPartnerJson,
    pub milestone_days: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum MemoryFeedItemJson {
    Meet(MemoryMeetItemJson),
    Milestone(MemoryMilestoneItemJson),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoriesFeedResponse {
    pub unlocked: bool,
    pub days_until_unlock: i32,
    pub unlock_at_days: i32,
    pub page: i32,
    pub limit: i32,
    pub has_more: bool,
    pub milestones: Vec<MemoryMilestoneItemJson>,
    pub items: Vec<MemoryFeedItemJson>,
}

fn partner_json(partner: &MemoryPartner) -> MemoryPartnerJson {
    MemoryPartnerJson {
        id: partner.id.clone(),
        nickname: partner.nickname.clone(),
        avatar_url: partner.avatar_url.clone(),
    }
}

fn map_meet_item(user_id: &str, proof: &MeetProofRow) -> MemoryMeetItemJson {
    let partner = partner_from_proof(user_id, proof);
    MemoryMeetItemJson {
        id: proof.id.clone(),
        kind: "meet",
        date: proof.streak_day_date.clone(),
        created_at: proof.created_at.to_rfc3339(),
        streak_id: proof.streak_id.clone(),
        partner: partner_json(&partner),
        photo_url: proof.photo_url.clone(),
        uploaded_by: UploadedByJson {
            id: proof.uploaded_by_id.clone(),
            nickname: proof.uploaded_by_nickname.clone(),
        },
        latitude: proof.latitude,
        longitude: proof.longitude,
    }
}

fn milestone_id(streak_id: &str, days: i32, date: &str) -> String {
    format!("milestone:{streak_id}:{days}:{date}")
}

fn map_milestones(
    computed: &[crate::milestones::ComputedMilestone],
    partners: &std::collections::HashMap<String, MemoryPartner>,
) -> Vec<MemoryMilestoneItemJson> {
    computed
        .iter()
        .filter_map(|milestone| {
            let partner = partners.get(&milestone.streak_id)?;
            Some(MemoryMilestoneItemJson {
                id: milestone_id(&milestone.streak_id, milestone.days, &milestone.date),
                kind: "milestone",
                date: milestone.date.clone(),
                streak_id: milestone.streak_id.clone(),
                partner: partner_json(partner),
                milestone_days: milestone.days,
            })
        })
        .collect()
}

async fn resolve_unlock_status(pool: &PgPool, user_id: &str) -> Result<(bool, i32), ApiError> {
    let met_days_count = count_met_days_for_user(pool, user_id).await?;
    let best_active_count = max_active_streak_count(pool, user_id).await?;
    let unlocked = met_days_count >= i64::from(MEMORIES_UNLOCK_DAYS);
    let days_until_unlock = if unlocked {
        0
    } else {
        (MEMORIES_UNLOCK_DAYS - best_active_count).max(0)
    };
    Ok((unlocked, days_until_unlock))
}

pub async fn get_memories_feed(
    pool: &PgPool,
    user_id: &str,
    page: i32,
    limit: i32,
    streak_id: Option<&str>,
) -> Result<MemoriesFeedResponse, ApiError> {
    if let Some(streak_id) = streak_id {
        find_streak_for_user(pool, streak_id, user_id)
            .await
            .map_err(|_| ApiError::new(404, codes::STREAK_NOT_FOUND, None))?;
    }

    let (unlocked, days_until_unlock) = resolve_unlock_status(pool, user_id).await?;

    if !unlocked {
        return Ok(MemoriesFeedResponse {
            unlocked: false,
            days_until_unlock,
            unlock_at_days: MEMORIES_UNLOCK_DAYS,
            page,
            limit,
            has_more: false,
            milestones: vec![],
            items: vec![],
        });
    }

    let fetch_limit = limit + 1;
    let proofs =
        list_meet_proofs_for_user(pool, user_id, page, fetch_limit, streak_id).await?;
    let met_day_rows = list_met_days_for_user(pool, user_id, streak_id).await?;
    let met_days: Vec<MetDayRow> = met_day_rows
        .into_iter()
        .map(|(streak_id, date)| MetDayRow { streak_id, date })
        .collect();
    let partners = load_partner_by_streak_id(pool, user_id, streak_id).await?;

    let has_more = proofs.len() as i32 > limit;
    let page_proofs: Vec<_> = proofs.into_iter().take(limit as usize).collect();
    let milestones = map_milestones(
        &compute_milestones_from_met_days(&met_days, &MEMORIES_MILESTONE_DAYS),
        &partners,
    );
    let meet_items: Vec<MemoryFeedItemJson> = page_proofs
        .iter()
        .map(|proof| MemoryFeedItemJson::Meet(map_meet_item(user_id, proof)))
        .collect();
    let milestone_items: Vec<MemoryFeedItemJson> = if page == 1 {
        milestones
            .iter()
            .cloned()
            .map(MemoryFeedItemJson::Milestone)
            .collect()
    } else {
        vec![]
    };

    let mut items = milestone_items;
    items.extend(meet_items);
    items.sort_by(sort_feed_items);

    Ok(MemoriesFeedResponse {
        unlocked: true,
        days_until_unlock: 0,
        unlock_at_days: MEMORIES_UNLOCK_DAYS,
        page,
        limit,
        has_more,
        milestones,
        items,
    })
}

fn sort_feed_items(a: &MemoryFeedItemJson, b: &MemoryFeedItemJson) -> std::cmp::Ordering {
    let date_a = feed_date(a);
    let date_b = feed_date(b);
    let date_cmp = date_b.cmp(&date_a);
    if date_cmp != std::cmp::Ordering::Equal {
        return date_cmp;
    }
    match (a, b) {
        (MemoryFeedItemJson::Meet(ma), MemoryFeedItemJson::Meet(mb)) => {
            mb.created_at.cmp(&ma.created_at)
        }
        (MemoryFeedItemJson::Milestone(ma), MemoryFeedItemJson::Milestone(mb)) => {
            mb.milestone_days.cmp(&ma.milestone_days)
        }
        (MemoryFeedItemJson::Milestone(_), MemoryFeedItemJson::Meet(_)) => {
            std::cmp::Ordering::Greater
        }
        (MemoryFeedItemJson::Meet(_), MemoryFeedItemJson::Milestone(_)) => {
            std::cmp::Ordering::Less
        }
    }
}

fn feed_date(item: &MemoryFeedItemJson) -> &str {
    match item {
        MemoryFeedItemJson::Meet(m) => &m.date,
        MemoryFeedItemJson::Milestone(m) => &m.date,
    }
}

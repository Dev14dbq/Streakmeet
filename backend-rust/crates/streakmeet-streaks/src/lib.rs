//! Streaks domain logic — parity with `backend/src/streaks/`.

mod calendar;
mod helpers;
mod models;
mod service;
pub mod worker;

pub use calendar::{
    add_days_to_date_string, generous_streak_timezone, get_local_date_string, get_local_time_parts,
    normalize_timezone,
};
pub use helpers::{pair_where_sql, partner_of, streak_for_user_where_sql};
pub use models::{StreakDetailJson, StreakListItemJson, StreakPartnerJson, StreakRecordJson};
pub use service::{
    create_streak, get_streak_detail, list_streaks, list_streaks_proto, streak_record_proto,
};

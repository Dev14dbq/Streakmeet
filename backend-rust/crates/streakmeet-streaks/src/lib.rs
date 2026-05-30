//! Streaks domain logic — parity with `backend/src/streaks/`.

mod calendar;
mod helpers;
mod magic_meet;
mod meet;
mod models;
mod remote_selfie;
mod service;
pub mod worker;

pub use calendar::{
    add_days_to_date_string, generous_streak_timezone, get_local_date_string, get_local_time_parts,
    instant_meet_streak_day, is_valid_timezone, normalize_timezone, remote_selfie_streak_day,
};
pub use helpers::{pair_where_sql, partner_of, streak_for_user_where_sql};
pub use magic_meet::{process_magic_meet, MagicMeetInput, MagicMeetPartnerJson, MagicMeetResultJson};
pub use meet::{record_meet_for_streak, record_meet_upload, RecordMeetResultJson};
pub use models::{StreakDetailJson, StreakListItemJson, StreakPartnerJson, StreakRecordJson};
pub use remote_selfie::{
    expire_stale_remote_selfie_requests, init_remote_selfie, reply_remote_selfie,
    RemoteSelfieReplyResultJson, RemoteSelfieRequestJson, REMOTE_SELFIE_TTL_MS,
};
pub use service::{
    create_streak, find_streak_for_user, get_streak_detail, list_streaks, list_streaks_proto,
    remind_partner, streak_record_proto,
};

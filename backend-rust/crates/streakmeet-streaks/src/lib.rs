//! Streaks domain logic — parity with `backend/src/streaks/`.

mod core;
mod models;
mod ops;

pub use core::calendar::{
    add_days_to_date_string, generous_streak_timezone, get_local_date_string, get_local_time_parts,
    instant_meet_streak_day, is_valid_timezone, normalize_timezone, remote_selfie_streak_day,
};
pub use core::helpers::{pair_where_sql, partner_of, streak_for_user_where_sql};
pub use models::{StreakDetailJson, StreakListItemJson, StreakPartnerJson, StreakRecordJson};
pub use ops::magic_meet::{
    MagicMeetInput, MagicMeetPartnerJson, MagicMeetResultJson, process_magic_meet,
};
pub use ops::meet::{RecordMeetResultJson, record_meet_for_streak, record_meet_upload};
pub use ops::remote_selfie::{
    REMOTE_SELFIE_TTL_MS, RemoteSelfieReplyResultJson, RemoteSelfieRequestJson,
    expire_stale_remote_selfie_requests, init_remote_selfie, reply_remote_selfie,
};
pub use ops::service::{
    create_streak, find_streak_for_user, get_streak_detail, list_streaks, list_streaks_proto,
    remind_partner, streak_record_proto,
};
pub use ops::worker;

//! Timezone helpers — parity with `@streakmeet/shared` streak calendar.

use chrono::{DateTime, Datelike, NaiveDate, Offset, Timelike, Utc};
use chrono_tz::Tz;

pub fn is_valid_timezone(timezone: &str) -> bool {
    timezone.parse::<Tz>().is_ok()
}

pub fn normalize_timezone(timezone: Option<&str>, fallback: &str) -> String {
    timezone
        .filter(|tz| is_valid_timezone(tz))
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

/// YYYY-MM-DD in the given IANA timezone.
pub fn get_local_date_string(timezone: &str, date: DateTime<Utc>) -> String {
    let tz = normalize_timezone(Some(timezone), "UTC");
    let parsed = tz.parse::<Tz>().unwrap_or(chrono_tz::UTC);
    date.with_timezone(&parsed).format("%Y-%m-%d").to_string()
}

pub fn add_days_to_date_string(date_str: &str, days: i32) -> String {
    let parts: Vec<_> = date_str.split('-').collect();
    if parts.len() != 3 {
        return date_str.to_string();
    }
    let y: i32 = parts[0].parse().unwrap_or(1970);
    let m: u32 = parts[1].parse().unwrap_or(1);
    let d: u32 = parts[2].parse().unwrap_or(1);
    let naive = NaiveDate::from_ymd_opt(y, m, d).unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
    let shifted = naive + chrono::Duration::days(days as i64);
    format!("{:04}-{:02}-{:02}", shifted.year(), shifted.month(), shifted.day())
}

/// UTC offset in minutes (positive = east of UTC).
pub fn get_utc_offset_minutes(timezone: &str, date: DateTime<Utc>) -> i32 {
    let tz = normalize_timezone(Some(timezone), "UTC");
    let parsed = tz.parse::<Tz>().unwrap_or(chrono_tz::UTC);
    let local = date.with_timezone(&parsed);
    local.offset().fix().local_minus_utc() / 60
}

/// Westernmost offset wins (longest window before streak day rolls).
pub fn generous_streak_timezone(
    timezone_a: Option<&str>,
    timezone_b: Option<&str>,
    date: DateTime<Utc>,
) -> String {
    let a = normalize_timezone(timezone_a, "UTC");
    let b = normalize_timezone(timezone_b, "UTC");
    let offset_a = get_utc_offset_minutes(&a, date);
    let offset_b = get_utc_offset_minutes(&b, date);
    if offset_a < offset_b {
        a
    } else if offset_b < offset_a {
        b
    } else if a <= b {
        a
    } else {
        b
    }
}

pub fn instant_meet_streak_day(streak_timezone: &str, at: chrono::DateTime<chrono::Utc>) -> String {
    get_local_date_string(streak_timezone, at)
}

/// Async remote selfie: anchor to the day when the request was sent.
pub fn remote_selfie_streak_day(
    streak_timezone: &str,
    initiated_at: chrono::DateTime<chrono::Utc>,
) -> String {
    get_local_date_string(streak_timezone, initiated_at)
}

pub fn get_local_time_parts(timezone: &str, date: DateTime<Utc>) -> (u32, u32) {
    let tz = normalize_timezone(Some(timezone), "UTC");
    let parsed = tz.parse::<Tz>().unwrap_or(chrono_tz::UTC);
    let local = date.with_timezone(&parsed);
    (local.hour(), local.minute())
}

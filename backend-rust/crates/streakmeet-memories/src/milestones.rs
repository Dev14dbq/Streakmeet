//! Milestone computation — parity with `backend/src/memories/milestones.ts`.

use crate::feed::MEMORIES_MILESTONE_DAYS;

#[derive(Debug, Clone)]
pub struct MetDayRow {
    pub streak_id: String,
    pub date: String,
}

#[derive(Debug, Clone)]
pub struct ComputedMilestone {
    pub streak_id: String,
    pub date: String,
    pub days: i32,
}

/// Returns true when `next` is exactly one calendar day after `prev` (YYYY-MM-DD).
pub fn is_next_calendar_day(prev: &str, next: &str) -> bool {
    let Ok(previous) = chrono::NaiveDate::parse_from_str(prev, "%Y-%m-%d") else {
        return false;
    };
    let Ok(current) = chrono::NaiveDate::parse_from_str(next, "%Y-%m-%d") else {
        return false;
    };
    current.signed_duration_since(previous).num_days() == 1
}

/// Derives milestone cards from chronological MET streak days per streak.
pub fn compute_milestones_from_met_days(
    days: &[MetDayRow],
    milestone_days: &[i32],
) -> Vec<ComputedMilestone> {
    let milestone_days = if milestone_days.is_empty() {
        &MEMORIES_MILESTONE_DAYS[..]
    } else {
        milestone_days
    };

    let mut by_streak: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for day in days {
        by_streak
            .entry(day.streak_id.clone())
            .or_default()
            .push(day.date.clone());
    }

    let mut milestones = Vec::new();

    for (streak_id, mut dates) in by_streak {
        dates.sort();
        let mut run_length = 0i32;
        let mut previous_date: Option<String> = None;

        for date in dates {
            if let Some(ref prev) = previous_date {
                if is_next_calendar_day(prev, &date) {
                    run_length += 1;
                } else {
                    run_length = 1;
                }
            } else {
                run_length = 1;
            }

            if milestone_days.contains(&run_length) {
                milestones.push(ComputedMilestone {
                    streak_id: streak_id.clone(),
                    date: date.clone(),
                    days: run_length,
                });
            }

            previous_date = Some(date);
        }
    }

    milestones.sort_by(|a, b| {
        b.date
            .cmp(&a.date)
            .then_with(|| b.days.cmp(&a.days))
    });
    milestones
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consecutive_days_trigger_milestone() {
        let days = vec![
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-01".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-02".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-03".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-04".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-05".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-06".into(),
            },
            MetDayRow {
                streak_id: "s1".into(),
                date: "2024-06-07".into(),
            },
        ];
        let result = compute_milestones_from_met_days(&days, &[7]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].days, 7);
        assert_eq!(result[0].date, "2024-06-07");
    }
}

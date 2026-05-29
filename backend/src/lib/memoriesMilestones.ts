import { MEMORIES_MILESTONE_DAYS } from './memoriesConstants.js'

export type MetDayRow = {
  streakId: string
  date: string
}

export type ComputedMilestone = {
  streakId: string
  date: string
  days: number
}

/** Returns true when `next` is exactly one calendar day after `prev` (YYYY-MM-DD). */
export function isNextCalendarDay(prev: string, next: string): boolean {
  const previous = new Date(`${prev}T12:00:00Z`)
  const current = new Date(`${next}T12:00:00Z`)
  const diffDays = (current.getTime() - previous.getTime()) / 86_400_000
  return diffDays === 1
}

/** Derives milestone cards from chronological MET streak days per streak. */
export function computeMilestonesFromMetDays(
  days: MetDayRow[],
  milestoneDays: readonly number[] = MEMORIES_MILESTONE_DAYS
): ComputedMilestone[] {
  const byStreak = new Map<string, string[]>()

  for (const day of days) {
    const dates = byStreak.get(day.streakId) ?? []
    dates.push(day.date)
    byStreak.set(day.streakId, dates)
  }

  const milestones: ComputedMilestone[] = []

  for (const [streakId, dates] of byStreak) {
    dates.sort()
    let runLength = 0
    let previousDate: string | null = null

    for (const date of dates) {
      if (previousDate && isNextCalendarDay(previousDate, date)) {
        runLength += 1
      } else {
        runLength = 1
      }

      if (milestoneDays.includes(runLength)) {
        milestones.push({ streakId, date, days: runLength })
      }

      previousDate = date
    }
  }

  return milestones.sort((a, b) => b.date.localeCompare(a.date) || b.days - a.days)
}

import { formatTimezoneLabel, getLocalToday } from './timezone'

export function streakToday(timezone?: string | null): string {
  return getLocalToday(timezone ?? undefined)
}

export function isStreakMetToday(streak: {
  lastMetDate?: string | null
  timezone?: string | null
}): boolean {
  if (!streak.lastMetDate) return false
  return streak.lastMetDate === streakToday(streak.timezone)
}

export function streakTimezoneLabel(timezone?: string | null): string | null {
  if (!timezone) return null
  return formatTimezoneLabel(timezone)
}

import { formatTimezoneLabel } from './timezone'
export { isStreakMetToday, streakToday } from '@streakmeet/shared'

export function streakTimezoneLabel(timezone?: string | null): string | null {
  if (!timezone) return null
  return formatTimezoneLabel(timezone)
}

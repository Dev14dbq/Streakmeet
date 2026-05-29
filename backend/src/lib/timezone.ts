export {
  isValidTimezone,
  normalizeTimezone,
  getLocalDateString,
  addDaysToDateString,
} from '@streakmeet/shared'

import { normalizeTimezone } from '@streakmeet/shared'

export function getLocalTimeParts(timezone: string, date = new Date()) {
  const tz = normalizeTimezone(timezone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  return {
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
  }
}

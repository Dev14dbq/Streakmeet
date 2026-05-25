export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export function normalizeTimezone(timezone: string | undefined | null, fallback = 'UTC'): string {
  if (timezone && isValidTimezone(timezone)) return timezone
  return fallback
}

/** YYYY-MM-DD в указанном часовом поясе */
export function getLocalDateString(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

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

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

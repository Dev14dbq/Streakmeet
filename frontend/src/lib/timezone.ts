/** IANA timezone устройства, напр. Europe/Moscow */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** YYYY-MM-DD в локальном (или указанном) часовом поясе */
export function getLocalToday(timezone?: string): string {
  const tz = timezone ?? getDeviceTimezone()
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(new Date())
  }
}

export function formatTimezoneLabel(timezone: string): string {
  try {
    const now = new Date()
    const offset =
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'shortOffset',
      })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''

    const city = timezone.split('/').pop()?.replace(/_/g, ' ') ?? timezone
    return offset ? `${city} (${offset})` : city
  } catch {
    return timezone
  }
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Локальное время в IANA timezone → Date (UTC instant) */
export function localTimeInZoneToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0)
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .formatToParts(new Date(utc))
        .map((p) => [p.type, p.value])
    )
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
    utc += Date.UTC(year, month - 1, day, hour, minute, 0) - asUtc
  }
  return new Date(utc)
}

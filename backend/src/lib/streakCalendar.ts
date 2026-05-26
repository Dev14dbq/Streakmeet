import { prisma } from './prisma.js'
import { getLocalDateString, normalizeTimezone } from './timezone.js'

/** UTC offset in minutes for IANA timezone (positive = east of UTC). */
export function getUtcOffsetMinutes(timezone: string, date = new Date()): number {
  const tz = normalizeTimezone(timezone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const mins = match[3] ? Number(match[3]) : 0
  return sign * (hours * 60 + mins)
}

/**
 * Pick the timezone where local midnight comes latest (westernmost offset).
 * Both partners get the longest window to complete a meet before the streak day rolls.
 */
export function generousStreakTimezone(
  timezoneA: string | undefined | null,
  timezoneB: string | undefined | null,
  date = new Date()
): string {
  const a = normalizeTimezone(timezoneA)
  const b = normalizeTimezone(timezoneB)
  const offsetA = getUtcOffsetMinutes(a, date)
  const offsetB = getUtcOffsetMinutes(b, date)
  if (offsetA < offsetB) return a
  if (offsetB < offsetA) return b
  return a.localeCompare(b) <= 0 ? a : b
}

export function streakCalendarDate(timezone: string, at: Date = new Date()): string {
  return getLocalDateString(normalizeTimezone(timezone), at)
}

/** Instant meet (magic meet): calendar day at meet time in streak timezone. */
export function instantMeetStreakDay(streakTimezone: string, at = new Date()): string {
  return streakCalendarDate(streakTimezone, at)
}

/**
 * Async remote selfie: anchor to the day when the request was sent.
 * Reply can cross local midnight in streak TZ within TTL without losing credit.
 */
export function remoteSelfieStreakDay(streakTimezone: string, initiatedAt: Date): string {
  return streakCalendarDate(streakTimezone, initiatedAt)
}

export function isStreakMetOnDate(lastMetDate: string | null | undefined, date: string): boolean {
  return !!lastMetDate && lastMetDate === date
}

/** Recompute Streak.timezone for all active streaks from both partners' profiles. */
export async function reconcileAllStreakTimezones(): Promise<number> {
  const streaks = await prisma.streak.findMany({
    where: { active: true },
    select: {
      id: true,
      timezone: true,
      userA: { select: { timezone: true } },
      userB: { select: { timezone: true } },
    },
  })

  let updated = 0
  for (const streak of streaks) {
    const next = generousStreakTimezone(streak.userA.timezone, streak.userB.timezone)
    if (next !== streak.timezone) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { timezone: next },
      })
      updated++
    }
  }
  return updated
}

/** Recompute streak timezone when a participant updates their profile timezone. */
export async function reconcileStreakTimezonesForUser(userId: string): Promise<number> {
  const streaks = await prisma.streak.findMany({
    where: {
      active: true,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: {
      id: true,
      timezone: true,
      userA: { select: { timezone: true } },
      userB: { select: { timezone: true } },
    },
  })

  let updated = 0
  for (const streak of streaks) {
    const next = generousStreakTimezone(streak.userA.timezone, streak.userB.timezone)
    if (next !== streak.timezone) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { timezone: next },
      })
      updated++
    }
  }
  return updated
}

export {
  isValidTimezone,
  normalizeTimezone,
  getLocalDateString,
  addDaysToDateString,
} from '@streakmeet/shared'

import { normalizeTimezone } from '@streakmeet/shared'

export function parsePagination(
  query: { page?: string | string[]; limit?: string | string[] },
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
) {
  const defaultPage = defaults.page ?? 1
  const defaultLimit = defaults.limit ?? 12
  const maxLimit = defaults.maxLimit ?? 50

  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit

  const page = Math.max(1, parseInt(String(rawPage), 10) || defaultPage)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(rawLimit), 10) || defaultLimit))

  return { page, limit }
}

export function routeParam(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] : value)
}

export function pairWhere(userAId: string, userBId: string) {
  return {
    OR: [
      { userAId, userBId },
      { userAId: userBId, userBId: userAId },
    ],
  }
}

export function streakForUserWhere(userId: string) {
  return { OR: [{ userAId: userId }, { userBId: userId }] }
}

type StreakParticipants = { userAId: string; userBId: string }
type StreakWithUsers<TUser = unknown> = StreakParticipants & { userA?: TUser; userB?: TUser }

export function partnerIdOf(streak: StreakParticipants, userId: string): string {
  return streak.userAId === userId ? streak.userBId : streak.userAId
}

export function partnerOf<TUser>(streak: StreakWithUsers<TUser>, userId: string): TUser {
  return (streak.userAId === userId ? streak.userB : streak.userA) as TUser
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
  return { hour: Number(pick('hour')), minute: Number(pick('minute')) }
}

import { prisma } from './prisma.js'
import { streakForUserWhere } from './relations.js'
export {
  getUtcOffsetMinutes,
  generousStreakTimezone,
  streakCalendarDate,
  instantMeetStreakDay,
  remoteSelfieStreakDay,
  isStreakMetOnDate,
  isStreakMetToday,
  streakToday,
} from '@streakmeet/shared'

import { generousStreakTimezone } from '@streakmeet/shared'

/** Recompute Streak.timezone from both partners' profiles (all active, or one user's streaks). */
export async function reconcileStreakTimezones(userId?: string): Promise<number> {
  const streaks = await prisma.streak.findMany({
    where: userId ? { active: true, ...streakForUserWhere(userId) } : { active: true },
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

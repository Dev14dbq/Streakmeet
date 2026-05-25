import { prisma } from './prisma.js'
import { notifyUser } from './socket.js'
import {
  addDaysToDateString,
  getLocalDateString,
  getLocalTimeParts,
  normalizeTimezone,
} from './timezone.js'

type NotifyKind = 'STREAK_1H' | 'STREAK_30M' | 'STREAK_BURNED'

async function sendStreakNotification(
  userId: string,
  streakId: string,
  kind: NotifyKind,
  localDate: string,
  payload: { message: string; route: string }
) {
  try {
    await prisma.streakNotificationLog.create({
      data: { userId, streakId, kind, localDate },
    })
  } catch {
    return
  }

  notifyUser(userId, 'notification', payload)
}

/** Каждые ~5 мин: предупреждения за 1ч/30м и сгорание серий в полночь по TZ пользователя */
export async function processStreakNotifications(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, timezone: true },
  })

  let sent = 0
  const now = new Date()

  for (const user of users) {
    const tz = normalizeTimezone(user.timezone)
    const { hour, minute } = getLocalTimeParts(tz, now)
    const today = getLocalDateString(tz, now)
    const yesterday = addDaysToDateString(today, -1)

    const streaks = await prisma.streak.findMany({
      where: {
        active: true,
        count: { gt: 0 },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: { select: { id: true, nickname: true } },
        userB: { select: { id: true, nickname: true } },
      },
    })

    for (const streak of streaks) {
      const partner = streak.userAId === user.id ? streak.userB : streak.userA
      const metToday = streak.lastMetDate === today
      const route = `/streaks/${partner.nickname}`

      if (hour === 23 && minute < 5 && !metToday) {
        await sendStreakNotification(user.id, streak.id, 'STREAK_1H', today, {
          message: `Серия с @${partner.nickname} сгорит через час!`,
          route,
        })
        sent++
        continue
      }

      if (hour === 23 && minute >= 30 && minute < 35 && !metToday) {
        await sendStreakNotification(user.id, streak.id, 'STREAK_30M', today, {
          message: `Серия с @${partner.nickname} сгорит через 30 минут!`,
          route,
        })
        sent++
        continue
      }

      if (hour === 0 && minute >= 5 && minute < 10 && streak.lastMetDate !== yesterday) {
        await prisma.streak.update({
          where: { id: streak.id },
          data: { count: 0 },
        })
        await sendStreakNotification(user.id, streak.id, 'STREAK_BURNED', yesterday, {
          message: `Серия с @${partner.nickname} сгорела 🔥`,
          route,
        })
        sent++
      }
    }
  }

  return sent
}

import { prisma } from '../db/client.js'
import {
  notifyUser,
  type NotificationPayload,
  type NotificationType,
} from '../notifications/socket.js'
import {
  addDaysToDateString,
  getLocalDateString,
  getLocalTimeParts,
  normalizeTimezone,
} from '../common/helpers.js'

type NotifyKind = 'STREAK_1H' | 'STREAK_30M' | 'STREAK_BURNED'

const KIND_TO_TYPE: Record<NotifyKind, NotificationType> = {
  STREAK_1H: 'streak_1h',
  STREAK_30M: 'streak_30m',
  STREAK_BURNED: 'streak_burned',
}

async function sendStreakNotification(
  userId: string,
  streakId: string,
  kind: NotifyKind,
  localDate: string,
  payload: NotificationPayload
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

/** Каждые ~5 мин: предупреждения и сгорание по календарю серии (Streak.timezone). */
export async function processStreakNotifications(): Promise<number> {
  const streaks = await prisma.streak.findMany({
    where: { active: true, count: { gt: 0 } },
    include: {
      userA: { select: { id: true, nickname: true } },
      userB: { select: { id: true, nickname: true } },
    },
  })

  let sent = 0
  const now = new Date()

  for (const streak of streaks) {
    const tz = normalizeTimezone(streak.timezone)
    const { hour, minute } = getLocalTimeParts(tz, now)
    const today = getLocalDateString(tz, now)
    const yesterday = addDaysToDateString(today, -1)
    const metToday = streak.lastMetDate === today

    const notifyBoth = async (kind: NotifyKind, localDate: string) => {
      for (const user of [streak.userA, streak.userB]) {
        const partner = user.id === streak.userAId ? streak.userB : streak.userA
        await sendStreakNotification(user.id, streak.id, kind, localDate, {
          type: KIND_TO_TYPE[kind],
          params: { partner: partner.nickname },
          route: `/streaks/${partner.nickname}`,
        })
        sent++
      }
    }

    if (hour === 23 && minute < 5 && !metToday) {
      await notifyBoth('STREAK_1H', today)
      continue
    }

    if (hour === 23 && minute >= 30 && minute < 35 && !metToday) {
      await notifyBoth('STREAK_30M', today)
      continue
    }

    if (hour === 0 && minute >= 5 && minute < 10 && streak.lastMetDate !== yesterday) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { count: 0 },
      })
      await notifyBoth('STREAK_BURNED', yesterday)
    }
  }

  return sent
}

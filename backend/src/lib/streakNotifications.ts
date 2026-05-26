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

    const notifyBoth = async (
      kind: NotifyKind,
      localDate: string,
      messageFor: (partnerNickname: string) => string
    ) => {
      for (const user of [streak.userA, streak.userB]) {
        const partner = user.id === streak.userAId ? streak.userB : streak.userA
        await sendStreakNotification(user.id, streak.id, kind, localDate, {
          message: messageFor(partner.nickname),
          route: `/streaks/${partner.nickname}`,
        })
        sent++
      }
    }

    if (hour === 23 && minute < 5 && !metToday) {
      await notifyBoth('STREAK_1H', today, (partner) => `Серия с @${partner} сгорит через час!`)
      continue
    }

    if (hour === 23 && minute >= 30 && minute < 35 && !metToday) {
      await notifyBoth(
        'STREAK_30M',
        today,
        (partner) => `Серия с @${partner} сгорит через 30 минут!`
      )
      continue
    }

    if (hour === 0 && minute >= 5 && minute < 10 && streak.lastMetDate !== yesterday) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { count: 0 },
      })
      await notifyBoth('STREAK_BURNED', yesterday, (partner) => `Серия с @${partner} сгорела 🔥`)
    }
  }

  return sent
}

import { prisma } from '../lib/prisma.js'
import { generousStreakTimezone } from '../lib/streakCalendar.js'
import { expireStaleRemoteSelfieRequests } from '../lib/remoteSelfie.js'
import { getLocalDateString, normalizeTimezone } from '../lib/timezone.js'
import { pairWhere, partnerOf, streakForUserWhere } from '../lib/relations.js'
import { findActiveUserByNickname } from '../lib/accountDeletion.js'
import {
  mapPendingRemoteSelfie,
  pendingRemoteSelfiesInclude,
} from '../lib/streakQueries.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'
import { notifyStreakRemind } from '../lib/notifications.js'

async function areAcceptedFriends(userId: string, partnerId: string): Promise<boolean> {
  const friendship = await prisma.friendship.findFirst({
    where: { status: 'ACCEPTED', ...pairWhere(userId, partnerId) },
  })
  return friendship !== null
}

export async function getPartnerTimezones(userId: string, partnerId: string): Promise<string> {
  const [self, partner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.user.findUnique({ where: { id: partnerId }, select: { timezone: true } }),
  ])
  return generousStreakTimezone(self?.timezone, partner?.timezone)
}

export async function listStreaks(userId: string) {
  const streaks = await prisma.streak.findMany({
    where: {
      ...streakForUserWhere(userId),
      active: true,
    },
    include: {
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
      remoteSelfies: pendingRemoteSelfiesInclude(userId),
    },
  })

  return streaks.map((s) => {
    const partner = partnerOf(s, userId)
    return {
      id: s.id,
      count: s.count,
      lastMetDate: s.lastMetDate,
      timezone: s.timezone,
      partner,
      pendingRemoteSelfie: mapPendingRemoteSelfie(s.remoteSelfies[0], userId),
    }
  })
}

export async function createStreak(userId: string, partnerId: string) {
  if (!partnerId.trim()) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }

  if (!(await areAcceptedFriends(userId, partnerId))) {
    throw new ApiHttpError(400, ErrorCodes.NOT_FRIENDS)
  }

  const existing = await prisma.streak.findFirst({
    where: { active: true, ...pairWhere(userId, partnerId) },
  })

  if (existing) {
    throw new ApiHttpError(400, ErrorCodes.STREAK_EXISTS)
  }

  return prisma.streak.create({
    data: {
      userAId: userId,
      userBId: partnerId,
      count: 0,
      timezone: await getPartnerTimezones(userId, partnerId),
    },
  })
}

export async function remindPartner(userId: string, partnerNickname: string) {
  const partner = await findActiveUserByNickname(partnerNickname)
  if (!partner) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }

  const streak = await prisma.streak.findFirst({
    where: { active: true, ...pairWhere(userId, partner.id) },
  })
  if (!streak) {
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true, timezone: true },
  })
  if (!sender) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }

  const today = getLocalDateString(normalizeTimezone(streak.timezone))
  if (streak.lastMetDate === today) {
    throw new ApiHttpError(400, ErrorCodes.STREAK_ALREADY_MET_TODAY)
  }

  notifyStreakRemind(partner.id, sender.nickname, Math.floor(Math.random() * 5))
  return { ok: true as const }
}

function streakDetailInclude(page: number, limit: number, userId: string) {
  return {
    userA: { select: { id: true, nickname: true, avatarUrl: true } },
    userB: { select: { id: true, nickname: true, avatarUrl: true } },
    remoteSelfies: pendingRemoteSelfiesInclude(userId),
    streakDays: {
      include: {
        meetProofs: {
          include: {
            uploadedBy: { select: { id: true, nickname: true } },
          },
        },
      },
      orderBy: { date: 'desc' as const },
      skip: (page - 1) * limit,
      take: limit,
    },
  }
}

export async function getStreakDetail(
  userId: string,
  param: string,
  page: number,
  limit: number
) {
  const isLegacyId = /^c[a-z0-9]{20,}$/i.test(param)
  const include = streakDetailInclude(page, limit, userId)

  let streakId: string | null = null
  if (isLegacyId) {
    streakId = param
  } else {
    const partner = await prisma.user.findFirst({
      where: { nickname: param.toLowerCase(), deletedAt: null },
      select: { id: true },
    })
    if (!partner) {
      throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
    }
    const meta = await prisma.streak.findFirst({
      where: { active: true, ...pairWhere(userId, partner.id) },
      select: { id: true },
    })
    streakId = meta?.id ?? null
  }

  if (!streakId) {
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }

  await expireStaleRemoteSelfieRequests(streakId)

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include,
  })

  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }

  return streak
}

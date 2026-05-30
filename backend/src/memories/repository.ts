import { prisma } from '../db/client.js'
import { partnerOf, streakForUserWhere, pairWhere } from '../common/helpers.js'

const partnerSelect = { id: true, nickname: true, avatarUrl: true } as const

const meetProofInclude = {
  uploadedBy: { select: { id: true, nickname: true } },
  streakDay: {
    select: {
      date: true,
      streakId: true,
      streak: {
        select: {
          id: true,
          userAId: true,
          userBId: true,
          userA: { select: partnerSelect },
          userB: { select: partnerSelect },
        },
      },
    },
  },
} as const

type MeetProofRow = Awaited<
  ReturnType<typeof prisma.meetProof.findMany<{ include: typeof meetProofInclude }>>
>[number]

export type { MeetProofRow }

function streakScope(userId: string, streakId?: string) {
  return streakId ? { id: streakId, ...streakForUserWhere(userId) } : streakForUserWhere(userId)
}

export async function countMetDaysForUser(userId: string): Promise<number> {
  return prisma.streakDay.count({
    where: {
      status: 'MET',
      streak: streakForUserWhere(userId),
    },
  })
}

export async function maxActiveStreakCount(userId: string): Promise<number> {
  const streaks = await prisma.streak.findMany({
    where: { active: true, ...streakForUserWhere(userId) },
    select: { count: true },
  })
  return streaks.reduce((max, streak) => Math.max(max, streak.count), 0)
}

export async function listMetDaysForUser(
  userId: string,
  streakId?: string
): Promise<Array<{ streakId: string; date: string }>> {
  return prisma.streakDay.findMany({
    where: {
      status: 'MET',
      streak: streakScope(userId, streakId),
    },
    select: { date: true, streakId: true },
    orderBy: { date: 'asc' },
  })
}

export async function listMeetProofsForUser(
  userId: string,
  page: number,
  limit: number,
  options?: { streakId?: string }
): Promise<MeetProofRow[]> {
  const streaks = await prisma.streak.findMany({
    where: streakScope(userId, options?.streakId),
    select: { id: true },
  })
  const streakIds = streaks.map((streak) => streak.id)
  if (streakIds.length === 0) return []

  return prisma.meetProof.findMany({
    where: {
      streakDay: { streakId: { in: streakIds } },
    },
    include: meetProofInclude,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
}

export function partnerFromProof(userId: string, proof: MeetProofRow) {
  return partnerOf(proof.streakDay.streak, userId)
}

export async function loadPartnerByStreakId(userId: string, streakId?: string) {
  const streaks = await prisma.streak.findMany({
    where: streakScope(userId, streakId),
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: partnerSelect },
      userB: { select: partnerSelect },
    },
  })

  const partners = new Map<string, { id: string; nickname: string; avatarUrl: string | null }>()
  for (const streak of streaks) {
    const partner = partnerOf(streak, userId)
    partners.set(streak.id, {
      id: partner.id,
      nickname: partner.nickname,
      avatarUrl: partner.avatarUrl,
    })
  }
  return partners
}

const photoProofInclude = {
  uploadedBy: { select: { id: true, nickname: true } },
  streakDay: {
    select: {
      streak: {
        select: {
          userA: { select: { id: true, nickname: true } },
          userB: { select: { id: true, nickname: true } },
        },
      },
    },
  },
} as const

export async function listForUser(
  userId: string,
  page: number,
  limit: number,
  options?: { mutualWithUserId?: string }
) {
  const streakWhere = options?.mutualWithUserId
    ? pairWhere(userId, options.mutualWithUserId)
    : streakForUserWhere(userId)

  const streaks = await prisma.streak.findMany({
    where: streakWhere,
    select: { id: true },
  })
  const streakIds = streaks.map((s) => s.id)
  if (streakIds.length === 0) return []

  return prisma.meetProof.findMany({
    where: {
      streakDay: { streakId: { in: streakIds } },
    },
    include: photoProofInclude,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
}

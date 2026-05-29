import { prisma } from './prisma.js'
import { pairWhere, streakForUserWhere } from './relations.js'

const meetProofInclude = {
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
    include: meetProofInclude,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
}

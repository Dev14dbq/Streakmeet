import { Router, type Response } from 'express'
import { optionalAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { parsePagination } from '../lib/pagination.js'

const router = Router()

const NICKNAME_RE = /^[a-z0-9_]{3,20}$/

async function findPublicUser(nickname: string) {
  return prisma.user.findFirst({
    where: { nickname: nickname.toLowerCase(), deletedAt: null },
    select: { id: true, nickname: true, avatarUrl: true, isPublic: true },
  })
}

async function getFriendship(viewerId: string | undefined, profileUserId: string) {
  if (!viewerId) return null
  if (viewerId === profileUserId) {
    return { status: 'SELF' as const }
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: viewerId, userBId: profileUserId },
        { userAId: profileUserId, userBId: viewerId },
      ],
    },
  })

  if (!friendship) return null

  return {
    id: friendship.id,
    status: friendship.status,
    isIncoming: friendship.userBId === viewerId && friendship.status === 'PENDING',
  }
}

async function getUserPhotos(
  userId: string,
  page: number,
  limit: number,
  options?: { mutualWithUserId?: string }
) {
  const streakWhere = options?.mutualWithUserId
    ? {
        OR: [
          { userAId: userId, userBId: options.mutualWithUserId },
          { userAId: options.mutualWithUserId, userBId: userId },
        ],
      }
    : { OR: [{ userAId: userId }, { userBId: userId }] }

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
    include: {
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
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
}

// GET /api/public/users/:nickname
router.get('/users/:nickname', optionalAuth, async (req: AuthRequest, res: Response) => {
  const nickname = String(req.params.nickname ?? '').toLowerCase()
  if (!NICKNAME_RE.test(nickname)) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const user = await findPublicUser(nickname)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const friendship = await getFriendship(req.userId, user.id)
  res.json({ user, friendship })
})

// GET /api/public/users/:nickname/photos?page=1&limit=12
router.get('/users/:nickname/photos', optionalAuth, async (req: AuthRequest, res: Response) => {
  const nickname = String(req.params.nickname ?? '').toLowerCase()
  if (!NICKNAME_RE.test(nickname)) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const user = await findPublicUser(nickname)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const friendship = await getFriendship(req.userId, user.id)
  const isFriendOrSelf = friendship?.status === 'ACCEPTED' || friendship?.status === 'SELF'

  if (!user.isPublic && !isFriendOrSelf) {
    res.status(403).json({ error: 'Private profile' })
    return
  }

  const { page, limit } = parsePagination(req.query)
  const mutualWithUserId =
    !user.isPublic && isFriendOrSelf && req.userId !== user.id ? req.userId : undefined
  const photos = await getUserPhotos(user.id, page, limit, { mutualWithUserId })
  res.json(photos)
})

export default router

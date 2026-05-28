import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { prisma } from '../lib/prisma.js'

import { notifyUser } from '../lib/socket.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'

const router = Router()
router.use(requireAuth, requireEmailVerified)

// GET /api/friends
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!

  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    include: {
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })

  // Форматируем для фронта
  const formatted = friendships.map((f) => {
    const isUserA = f.userAId === userId
    const friend = isUserA ? f.userB : f.userA
    return {
      id: f.id,
      status: f.status,
      isIncomingRequest: !isUserA && f.status === 'PENDING',
      friend,
    }
  })

  res.json(formatted)
})

// POST /api/friends/request
router.post('/request', async (req: AuthRequest, res: Response) => {
  const { friendId } = req.body as { friendId?: string }
  const userId = req.userId!

  if (typeof friendId !== 'string' || !friendId.trim()) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }

  if (userId === friendId) {
    sendError(res, 400, ErrorCodes.CANNOT_ADD_SELF)
    return
  }

  const friend = await prisma.user.findFirst({
    where: { id: friendId, deletedAt: null },
    select: { id: true },
  })
  if (!friend) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }

  // Проверяем, нет ли уже связи
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: userId, userBId: friendId },
        { userAId: friendId, userBId: userId },
      ],
    },
  })

  if (existing) {
    sendError(res, 400, ErrorCodes.FRIENDSHIP_EXISTS)
    return
  }

  const friendship = await prisma.friendship.create({
    data: {
      userAId: userId,
      userBId: friendId,
      status: 'PENDING',
    },
  })

  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  })

  notifyUser(friendId, 'notification', {
    type: 'friend_request',
    message: `@${requester?.nickname ?? 'Кто-то'} хочет добавить тебя в друзья`,
    route: '/',
  })

  res.json(friendship)
})

// POST /api/friends/accept
router.post('/accept', async (req: AuthRequest, res: Response) => {
  const { friendshipId } = req.body as { friendshipId?: string }
  const userId = req.userId!

  if (typeof friendshipId !== 'string' || !friendshipId.trim()) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } })
  if (!friendship || friendship.userBId !== userId) {
    sendError(res, 404, ErrorCodes.FRIENDSHIP_NOT_FOUND)
    return
  }

  if (friendship.status !== 'PENDING') {
    sendError(res, 400, ErrorCodes.FRIENDSHIP_NOT_PENDING)
    return
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'ACCEPTED' },
  })

  const accepter = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  })

  notifyUser(friendship.userAId, 'notification', {
    type: 'friend_accepted',
    message: `@${accepter?.nickname ?? 'Кто-то'} принял(а) твою заявку в друзья`,
    route: '/',
  })

  res.json(updated)
})

export default router

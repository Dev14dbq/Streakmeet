import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { prisma } from '../lib/prisma.js'
import {
  broadcastLocationOffToFriends,
  broadcastLocationToFriends,
  type FriendLocationPayload,
} from '../lib/location.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'

const router = Router()
router.use(requireAuth, requireEmailVerified)

function mePayload(user: {
  sharingLocation: boolean
  lastLatitude: number | null
  lastLongitude: number | null
  lastLocationAt: Date | null
}) {
  return {
    sharingLocation: user.sharingLocation,
    latitude: user.lastLatitude,
    longitude: user.lastLongitude,
    updatedAt: user.lastLocationAt?.toISOString() ?? null,
  }
}

// GET /api/location/me
router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: {
      sharingLocation: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
    },
  })
  res.json(mePayload(user))
})

// GET /api/location/friends — принятые друзья с включённой трансляцией
router.get('/friends', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const friendIds = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })

  const ids = friendIds.map((f) => (f.userAId === userId ? f.userBId : f.userAId))
  if (ids.length === 0) {
    res.json([])
    return
  }

  const friends = await prisma.user.findMany({
    where: {
      id: { in: ids },
      sharingLocation: true,
      lastLatitude: { not: null },
      lastLongitude: { not: null },
      deletedAt: null,
    },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
    },
    orderBy: { nickname: 'asc' },
  })

  res.json(
    friends.map((f) => ({
      id: f.id,
      nickname: f.nickname,
      avatarUrl: f.avatarUrl,
      latitude: f.lastLatitude!,
      longitude: f.lastLongitude!,
      updatedAt: f.lastLocationAt!.toISOString(),
    }))
  )
})

// POST /api/location/sharing
router.post('/sharing', async (req: AuthRequest, res: Response) => {
  const { enabled } = req.body as { enabled?: boolean }
  if (typeof enabled !== 'boolean') {
    sendError(res, 400, ErrorCodes.INVALID_BOOLEAN)
    return
  }

  const userId = req.userId!
  const user = await prisma.user.update({
    where: { id: userId },
    data: enabled
      ? { sharingLocation: true }
      : {
          sharingLocation: false,
          lastLatitude: null,
          lastLongitude: null,
          lastLocationAt: null,
        },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      sharingLocation: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
    },
  })

  if (!enabled) {
    await broadcastLocationOffToFriends(userId)
  } else if (
    user.lastLatitude != null &&
    user.lastLongitude != null &&
    user.lastLocationAt != null
  ) {
    const payload: FriendLocationPayload = {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      latitude: user.lastLatitude,
      longitude: user.lastLongitude,
      updatedAt: user.lastLocationAt.toISOString(),
    }
    await broadcastLocationToFriends(userId, payload)
  }

  res.json(mePayload(user))
})

// POST /api/location/update
router.post('/update', async (req: AuthRequest, res: Response) => {
  const { latitude, longitude } = req.body as {
    latitude?: number
    longitude?: number
  }

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    sendError(res, 400, ErrorCodes.INVALID_COORDINATES)
    return
  }

  const userId = req.userId!
  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sharingLocation: true },
  })

  if (!existing.sharingLocation) {
    sendError(res, 409, ErrorCodes.LOCATION_SHARING_DISABLED)
    return
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastLocationAt: new Date(),
    },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
    },
  })

  const payload: FriendLocationPayload = {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    latitude: user.lastLatitude!,
    longitude: user.lastLongitude!,
    updatedAt: user.lastLocationAt!.toISOString(),
  }

  await broadcastLocationToFriends(userId, payload)
  res.json({ ok: true, ...payload })
})

export default router

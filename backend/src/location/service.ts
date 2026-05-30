import { prisma } from '../db/client.js'
import { ErrorCodes, ApiHttpError } from '../common/errors.js'
import { partnerIdOf } from '../common/helpers.js'
import { broadcastToUsers } from '../notifications/socket.js'

export interface FriendLocationPayload {
  id: string
  nickname: string
  avatarUrl: string | null
  latitude: number
  longitude: number
  updatedAt: string
}

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })

  return friendships.map((f) => partnerIdOf(f, userId))
}

export async function broadcastLocationToFriends(
  userId: string,
  payload: FriendLocationPayload
): Promise<void> {
  const friendIds = await getAcceptedFriendIds(userId)
  if (friendIds.length === 0) return
  broadcastToUsers(friendIds, 'friend:location', payload)
}

export async function broadcastLocationOffToFriends(userId: string): Promise<void> {
  const friendIds = await getAcceptedFriendIds(userId)
  if (friendIds.length === 0) return
  broadcastToUsers(friendIds, 'friend:location:off', { id: userId })
}

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

export async function getMyLocation(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      sharingLocation: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
    },
  })
  return mePayload(user)
}

export async function getFriendsLocations(userId: string) {
  const ids = await getAcceptedFriendIds(userId)
  if (ids.length === 0) {
    return []
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

  return friends.map((f) => ({
    id: f.id,
    nickname: f.nickname,
    avatarUrl: f.avatarUrl,
    latitude: f.lastLatitude!,
    longitude: f.lastLongitude!,
    updatedAt: f.lastLocationAt!.toISOString(),
  }))
}

export async function setLocationSharing(userId: string, enabled: unknown) {
  if (typeof enabled !== 'boolean') {
    throw new ApiHttpError(400, ErrorCodes.INVALID_BOOLEAN)
  }

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

  return mePayload(user)
}

export async function updateLocation(userId: string, latitude: unknown, longitude: unknown) {
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
    throw new ApiHttpError(400, ErrorCodes.INVALID_COORDINATES)
  }

  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sharingLocation: true },
  })

  if (!existing.sharingLocation) {
    throw new ApiHttpError(409, ErrorCodes.LOCATION_SHARING_DISABLED)
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
  return { ok: true as const, ...payload }
}

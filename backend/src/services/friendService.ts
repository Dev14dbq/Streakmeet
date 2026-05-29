import { prisma } from '../lib/prisma.js'
import { pairWhere } from '../lib/relations.js'
import { notifyFriendAccepted, notifyFriendRequest } from '../lib/notifications.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'

export async function listFriends(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    include: {
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })

  return friendships.map((f) => {
    const isUserA = f.userAId === userId
    const friend = isUserA ? f.userB : f.userA
    return {
      id: f.id,
      status: f.status,
      isIncomingRequest: !isUserA && f.status === 'PENDING',
      friend,
    }
  })
}

export async function requestFriend(userId: string, friendId: string | undefined) {
  if (typeof friendId !== 'string' || !friendId.trim()) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }

  if (userId === friendId) {
    throw new ApiHttpError(400, ErrorCodes.CANNOT_ADD_SELF)
  }

  const friend = await prisma.user.findFirst({
    where: { id: friendId, deletedAt: null },
    select: { id: true },
  })
  if (!friend) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }

  const existing = await prisma.friendship.findFirst({
    where: pairWhere(userId, friendId),
  })
  if (existing) {
    throw new ApiHttpError(400, ErrorCodes.FRIENDSHIP_EXISTS)
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

  notifyFriendRequest(friendId, requester?.nickname ?? '')

  return friendship
}

export async function acceptFriend(userId: string, friendshipId: string | undefined) {
  if (typeof friendshipId !== 'string' || !friendshipId.trim()) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } })
  if (!friendship || friendship.userBId !== userId) {
    throw new ApiHttpError(404, ErrorCodes.FRIENDSHIP_NOT_FOUND)
  }

  if (friendship.status !== 'PENDING') {
    throw new ApiHttpError(400, ErrorCodes.FRIENDSHIP_NOT_PENDING)
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'ACCEPTED' },
  })

  const accepter = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  })

  notifyFriendAccepted(friendship.userAId, accepter?.nickname ?? '')

  return updated
}

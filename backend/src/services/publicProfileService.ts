import { prisma } from '../lib/prisma.js'
import { pairWhere } from '../lib/relations.js'
import { listForUser } from '../lib/photoRepository.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'

const NICKNAME_RE = /^[a-z0-9_]{3,20}$/

export async function findPublicUser(nickname: string) {
  return prisma.user.findFirst({
    where: { nickname: nickname.toLowerCase(), deletedAt: null },
    select: { id: true, nickname: true, avatarUrl: true, isPublic: true },
  })
}

export async function getFriendship(viewerId: string | undefined, profileUserId: string) {
  if (!viewerId) return null
  if (viewerId === profileUserId) {
    return { status: 'SELF' as const }
  }

  const friendship = await prisma.friendship.findFirst({
    where: pairWhere(viewerId, profileUserId),
  })

  if (!friendship) return null

  return {
    id: friendship.id,
    status: friendship.status,
    isIncoming: friendship.userBId === viewerId && friendship.status === 'PENDING',
  }
}

async function resolvePublicProfile(viewerId: string | undefined, nickname: string) {
  const normalized = nickname.toLowerCase()
  if (!NICKNAME_RE.test(normalized)) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }

  const user = await findPublicUser(normalized)
  if (!user) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }

  const friendship = await getFriendship(viewerId, user.id)
  return { user, friendship }
}

export async function getUserProfile(viewerId: string | undefined, nickname: string) {
  return resolvePublicProfile(viewerId, nickname)
}

export async function getUserPhotos(
  userId: string,
  page: number,
  limit: number,
  options?: { mutualWithUserId?: string }
) {
  return listForUser(userId, page, limit, options)
}

export async function getUserPhotosForProfile(
  viewerId: string | undefined,
  nickname: string,
  page: number,
  limit: number
) {
  const { user, friendship } = await resolvePublicProfile(viewerId, nickname)
  const isFriendOrSelf = friendship?.status === 'ACCEPTED' || friendship?.status === 'SELF'

  if (!user.isPublic && !isFriendOrSelf) {
    throw new ApiHttpError(403, ErrorCodes.PRIVATE_PROFILE)
  }

  const mutualWithUserId =
    !user.isPublic && isFriendOrSelf && viewerId !== user.id ? viewerId : undefined

  return getUserPhotos(user.id, page, limit, { mutualWithUserId })
}

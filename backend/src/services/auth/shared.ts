import { prisma } from '../../lib/prisma.js'
import {
  findActiveUserByNickname,
  findUserByEmail,
  isRetentionExpired,
  purgeUser,
} from '../../lib/accountDeletion.js'
import { isValidTimezone } from '../../lib/timezone.js'
import { acceptCurrentLegalForUser } from '../../lib/legalDocuments.js'
import { markEmailVerified } from '../../lib/emailVerify.js'
import { userProfileSelect, type UserProfileRow } from '../../lib/userPayload.js'
import { DeletedAccountPendingError } from './errors.js'
import { ErrorCodes } from '../../lib/apiErrors.js'
import { ApiHttpError } from '../../lib/httpErrors.js'

export async function syncUserTimezone(userId: string, timezone?: string) {
  if (!timezone || !isValidTimezone(timezone)) return
  await prisma.user.update({
    where: { id: userId },
    data: { timezone },
  })
}

export function safeNickname(email: string) {
  return email
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 20)
}

export async function assertNotDeletedAccount(user: {
  id: string
  email: string
  deletedAt: Date | null
}) {
  if (!user.deletedAt) return

  if (isRetentionExpired(user.deletedAt)) {
    await purgeUser(user.id)
    throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  }

  throw new DeletedAccountPendingError({ email: user.email, deletedAt: user.deletedAt })
}

export async function findOrCreateOAuthUser(data: {
  email: string
  provider: 'google' | 'apple'
  displayName?: string
  timezone?: string
}) {
  let user = await findUserByEmail(data.email)

  if (user?.deletedAt) {
    return user
  }

  const timezone = data.timezone && isValidTimezone(data.timezone) ? data.timezone : undefined

  if (!user) {
    let base = safeNickname(data.email)
    let nick = base
    let attempt = 0
    while (await findActiveUserByNickname(nick)) {
      attempt++
      nick = `${base}${attempt}`
    }

    user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: '',
        nickname: nick,
        emailVerifiedAt: new Date(),
        ...(timezone ? { timezone } : {}),
      },
    })
    await acceptCurrentLegalForUser(user.id)
  } else {
    if (timezone) {
      await syncUserTimezone(user.id, timezone)
    }
    await markEmailVerified(user.id)
  }

  return user
}

export async function restoreDeletedUser(userId: string, options?: { oauthVerified?: boolean }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      ...(options?.oauthVerified ? { emailVerifiedAt: new Date(), emailVerifyToken: null } : {}),
    },
    select: { ...userProfileSelect, passwordHash: true },
  })
}

export async function loadFullUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { ...userProfileSelect, passwordHash: true },
  })
}

export type { UserProfileRow }

import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'
import {
  findUserByEmail,
  findActiveUserByNickname,
  isRetentionExpired,
  purgeUser,
  deletedAccountPayload,
} from '../common/account.js'
import { isValidTimezone, normalizeTimezone } from '../common/helpers.js'
import { acceptCurrentLegalForUser } from '../legal/documents.js'
import { issueEmailVerification, markEmailVerified } from './verification.js'
import {
  ErrorCodes,
  ApiHttpError,
  AuthServiceError,
  DeletedAccountPendingError,
} from '../common/errors.js'
import type { AuthResponse } from '../types/api.js'
import { userProfileSelect, type UserProfileRow } from '../users/payload.js'
import { buildAuthResponse } from './token.js'

export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  if (!email || !email.includes('@')) throw new ApiHttpError(400, ErrorCodes.INVALID_EMAIL)
  const user = await findUserByEmail(email)
  return { exists: !!user }
}

export async function login(input: {
  email?: string
  password?: string
  timezone?: string
}): Promise<AuthResponse> {
  const { email, password, timezone } = input
  if (!email || !password) throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  const user = await findUserByEmail(email)
  if (!user || !user.passwordHash) throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  await assertNotDeletedAccount(user)
  await syncUserTimezone(user.id, timezone)
  return buildAuthResponse(user as UserProfileRow & { passwordHash: string })
}

export async function register(input: {
  email?: string
  password?: string
  nickname?: string
  username?: string
  timezone?: string
}): Promise<AuthResponse> {
  const { email, password, username, timezone } = input
  if (!email || !password || !username) throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  if (password.length < 8) throw new ApiHttpError(400, ErrorCodes.PASSWORD_TOO_SHORT)
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new ApiHttpError(400, ErrorCodes.INVALID_USERNAME)

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedUsername = username.toLowerCase()

  const existingEmail = await findUserByEmail(normalizedEmail)
  if (existingEmail) {
    if (existingEmail.deletedAt) {
      if (isRetentionExpired(existingEmail.deletedAt)) {
        await purgeUser(existingEmail.id)
      } else {
        throw new ApiHttpError(409, ErrorCodes.ACCOUNT_DELETED)
      }
    } else {
      throw new ApiHttpError(409, ErrorCodes.EMAIL_ALREADY_IN_USE)
    }
  }

  const existingNickname = await findActiveUserByNickname(normalizedUsername)
  if (existingNickname) throw new ApiHttpError(409, ErrorCodes.USERNAME_TAKEN)

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      nickname: normalizedUsername,
      timezone: normalizeTimezone(timezone),
    },
    select: { ...userProfileSelect, passwordHash: true },
  })
  await acceptCurrentLegalForUser(user.id)
  try {
    await issueEmailVerification(user.id, user.email)
  } catch (e) {
    console.error('[register] verification email failed:', e)
  }
  return buildAuthResponse(user)
}

export async function syncUserTimezone(userId: string, timezone?: string) {
  if (!timezone || !isValidTimezone(timezone)) return
  await prisma.user.update({ where: { id: userId }, data: { timezone } })
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
  throw new DeletedAccountPendingError(
    deletedAccountPayload({ email: user.email, deletedAt: user.deletedAt })
  )
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

export async function findOrCreateOAuthUser(data: {
  email: string
  provider: 'google' | 'apple'
  displayName?: string
  timezone?: string
}) {
  let user = await findUserByEmail(data.email)
  if (user?.deletedAt) return user

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
    if (timezone) await syncUserTimezone(user.id, timezone)
    await markEmailVerified(user.id)
  }
  return user
}

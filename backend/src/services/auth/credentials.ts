import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import {
  findActiveUserByNickname,
  findUserByEmail,
  isRetentionExpired,
  purgeUser,
} from '../../lib/accountDeletion.js'
import { normalizeTimezone } from '../../lib/timezone.js'
import { acceptCurrentLegalForUser } from '../../lib/legalDocuments.js'
import { issueEmailVerification } from '../../lib/emailVerify.js'
import { ErrorCodes } from '../../lib/apiErrors.js'
import type { AuthResponse } from '../../types/api.js'
import { userProfileSelect, type UserProfileRow } from '../../lib/userPayload.js'
import { ApiHttpError } from '../../lib/httpErrors.js'
import { buildAuthResponse } from './tokens.js'
import { assertNotDeletedAccount, syncUserTimezone } from './shared.js'

export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  if (!email || !email.includes('@')) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_EMAIL)
  }
  const user = await findUserByEmail(email)
  return { exists: !!user }
}

export async function login(input: {
  email?: string
  password?: string
  timezone?: string
}): Promise<AuthResponse> {
  const { email, password, timezone } = input
  if (!email || !password) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }
  const user = await findUserByEmail(email)
  if (!user || !user.passwordHash) {
    throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  }
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
  if (!email || !password || !username) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }
  if (password.length < 6) {
    throw new ApiHttpError(400, ErrorCodes.PASSWORD_TOO_SHORT)
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_USERNAME)
  }

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
  if (existingNickname) {
    throw new ApiHttpError(409, ErrorCodes.USERNAME_TAKEN)
  }

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

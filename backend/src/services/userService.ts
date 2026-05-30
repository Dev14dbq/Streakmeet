import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { saveBase64ImageAsAvif } from '../lib/saveImage.js'
import { ApiHttpError, isValidBase64Image } from '../lib/httpErrors.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { isValidTimezone } from '../lib/timezone.js'
import { findUserByEmail } from '../lib/accountDeletion.js'
import { reconcileStreakTimezones } from '../lib/streakCalendar.js'
import { userProfileSelect, userProfilePayload } from '../lib/userPayload.js'
import { issueEmailVerification } from '../lib/emailVerify.js'
import { listForUser } from '../lib/photoRepository.js'

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userProfileSelect,
  })
  if (!user) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }
  return userProfilePayload(user)
}

export async function deleteAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  })
  return { success: true as const }
}

export async function updateSettings(userId: string, timezone: string | undefined) {
  if (!timezone || typeof timezone !== 'string') {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }
  try {
    if (!isValidTimezone(timezone)) throw new Error('invalid')
  } catch {
    throw new ApiHttpError(400, ErrorCodes.INVALID_TIMEZONE)
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { timezone },
    select: userProfileSelect,
  })
  await reconcileStreakTimezones(userId)
  return userProfilePayload(user)
}

export async function updatePreferences(
  userId: string,
  prefs: { notifyFriends?: boolean; notifyMeet?: boolean; geoOnPhotos?: boolean }
) {
  const data: Record<string, boolean> = {}
  if (typeof prefs.notifyFriends === 'boolean') data.notifyFriends = prefs.notifyFriends
  if (typeof prefs.notifyMeet === 'boolean') data.notifyMeet = prefs.notifyMeet
  if (typeof prefs.geoOnPhotos === 'boolean') data.geoOnPhotos = prefs.geoOnPhotos
  if (Object.keys(data).length === 0) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: userProfileSelect,
  })
  return userProfilePayload(user)
}

export async function updateEmail(
  userId: string,
  email: string | undefined,
  currentPassword: string | undefined
) {
  if (!email || !email.includes('@')) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_EMAIL)
  }
  if (!currentPassword) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing && existing.id !== userId) {
    throw new ApiHttpError(409, ErrorCodes.EMAIL_ALREADY_IN_USE)
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
  if (!current) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }
  if (!current.passwordHash) {
    throw new ApiHttpError(400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)
  }
  const validPassword = await bcrypt.compare(currentPassword, current.passwordHash)
  if (!validPassword) {
    throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalizedEmail,
      ...(current.passwordHash ? { emailVerifiedAt: null, emailVerifyToken: null } : {}),
    },
    select: userProfileSelect,
  })

  if (current.passwordHash) {
    try {
      await issueEmailVerification(userId, normalizedEmail)
    } catch (e) {
      console.error('[users/email] verification send failed:', e)
    }
  }

  return userProfilePayload(user)
}

export async function updatePassword(
  userId: string,
  currentPassword: string | undefined,
  newPassword: string | undefined
) {
  if (!currentPassword || !newPassword) {
    throw new ApiHttpError(400, ErrorCodes.MISSING_FIELD)
  }
  if (newPassword.length < 6) {
    throw new ApiHttpError(400, ErrorCodes.PASSWORD_TOO_SHORT)
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
  if (!current) {
    throw new ApiHttpError(404, ErrorCodes.USER_NOT_FOUND)
  }
  if (!current.passwordHash) {
    throw new ApiHttpError(400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)
  }
  const validPassword = await bcrypt.compare(currentPassword, current.passwordHash)
  if (!validPassword) {
    throw new ApiHttpError(401, ErrorCodes.INVALID_CREDENTIALS)
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  })
  return { success: true as const }
}

export async function updatePublic(userId: string, isPublic: unknown) {
  if (typeof isPublic !== 'boolean') {
    throw new ApiHttpError(400, ErrorCodes.INVALID_BOOLEAN)
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isPublic },
    select: userProfileSelect,
  })
  return userProfilePayload(user)
}

export async function uploadAvatar(userId: string, photoBase64: unknown) {
  if (!isValidBase64Image(photoBase64)) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_PHOTO)
  }

  try {
    const avatarUrl = await saveBase64ImageAsAvif(photoBase64, `avatar_${userId}_${Date.now()}`)
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    })
    return { avatarUrl }
  } catch (e) {
    console.error('Avatar upload error:', e)
    throw new ApiHttpError(500, ErrorCodes.AVATAR_SAVE_FAILED)
  }
}

export async function listPhotos(userId: string, page: number, limit: number) {
  return listForUser(userId, page, limit)
}

export async function searchUsers(userId: string, query: string | undefined) {
  if (!query || typeof query !== 'string') {
    return []
  }

  const normalized = query.toLowerCase().trim()

  return prisma.user.findMany({
    where: {
      deletedAt: null,
      NOT: { id: userId },
      OR: [
        { nickname: { contains: normalized, mode: 'insensitive' } },
        { qrCodeId: { contains: normalized, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nickname: true, avatarUrl: true, qrCodeId: true },
    take: 10,
    orderBy: { nickname: 'asc' },
  })
}

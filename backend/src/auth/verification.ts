import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../db/client.js'
import { findUserByEmail } from '../common/account.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../notifications/email.js'
import { ErrorCodes, AuthServiceError, faceErrorFromException } from '../common/errors.js'

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const token = generateToken()
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifyToken: token, emailVerifiedAt: null },
  })
  await sendVerificationEmail(email, token)
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date(), emailVerifyToken: null },
  })
}

const lastResendAt = new Map<string, number>()

export async function verifyEmailWithToken(token: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true },
  })
  if (!user) throw new AuthServiceError(400, ErrorCodes.EMAIL_VERIFY_TOKEN_INVALID)
  await markEmailVerified(user.id)
}

export async function verifyEmailAndGetRedirect(token: string): Promise<string> {
  const appUrl = (process.env.APP_PUBLIC_URL ?? 'https://spectrmod.com').replace(/\/$/, '')
  if (!token) return `${appUrl}/verify-email?error=invalid`
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true },
  })
  if (!user) return `${appUrl}/verify-email?error=invalid`
  await markEmailVerified(user.id)
  return `${appUrl}/verify-email?verified=1`
}

export async function resendVerification(userId: string): Promise<{ success: true }> {
  const last = lastResendAt.get(userId) ?? 0
  if (Date.now() - last < 60_000) throw new AuthServiceError(429, ErrorCodes.RESEND_COOLDOWN)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, passwordHash: true },
  })
  if (!user || !user.passwordHash) return { success: true }
  if (user.emailVerifiedAt) return { success: true }
  try {
    await issueEmailVerification(userId, user.email)
    lastResendAt.set(userId, Date.now())
    return { success: true }
  } catch (e) {
    console.error('[resend-verification]', e)
    throw new AuthServiceError(500, ErrorCodes.EMAIL_SEND_FAILED)
  }
}

export async function forgotPassword(email: unknown): Promise<{ success: true }> {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new AuthServiceError(400, ErrorCodes.INVALID_EMAIL)
  }
  const normalizedEmail = email.toLowerCase().trim()
  const user = await findUserByEmail(normalizedEmail)
  if (!user || user.deletedAt) return { success: true }
  if (!user.passwordHash) throw new AuthServiceError(400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)

  const token = generateToken()
  const expires = new Date(Date.now() + 3_600_000)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpires: expires },
  })
  try {
    await sendPasswordResetEmail(user.email, token)
  } catch (e) {
    console.error('[forgot-password] send failed:', e)
    throw new AuthServiceError(500, ErrorCodes.EMAIL_SEND_FAILED)
  }
  return { success: true }
}

export async function resetPassword(input: {
  token?: string
  password?: string
}): Promise<{ success: true }> {
  const { token, password } = input
  if (!token || !password) throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
  if (password.length < 8) throw new AuthServiceError(400, ErrorCodes.PASSWORD_TOO_SHORT)

  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token, passwordResetExpires: { gt: new Date() } },
  })
  if (!user) throw new AuthServiceError(400, ErrorCodes.PASSWORD_RESET_TOKEN_INVALID)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  })
  return { success: true }
}

import {
  CURRENT_FACE_MODEL,
  embedBurstFromBase64,
  ensureFaceService,
  passesEnrollQuality,
} from '../face/service.js'

const MIN_INPUT_FRAMES = 3
const MAX_INPUT_FRAMES = 16
const MIN_ACCEPTED_EMBEDDINGS = 4

export async function enrollFace(
  userId: string,
  photos: unknown
): Promise<{ success: true; accepted: number; total: number }> {
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    throw new AuthServiceError(400, ErrorCodes.PHOTOS_REQUIRED)
  }
  if (photos.length < MIN_INPUT_FRAMES || photos.length > MAX_INPUT_FRAMES) {
    throw new AuthServiceError(400, ErrorCodes.FACE_ENROLL_TOO_FEW_FRAMES)
  }
  for (const photo of photos) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
      throw new AuthServiceError(400, ErrorCodes.INVALID_PHOTO)
    }
  }

  try {
    await ensureFaceService()
    const results = await embedBurstFromBase64(photos as string[])

    const accepted: {
      vector: number[]
      detScore: number
      yaw: number
      pitch: number
      blurVar: number
    }[] = []
    const reasons: Record<string, number> = {}

    for (const r of results) {
      if (!r.face) {
        const k = r.error ?? 'no_face'
        reasons[k] = (reasons[k] ?? 0) + 1
        continue
      }
      const q = passesEnrollQuality(r.face)
      if (!q.ok) {
        reasons[q.reason ?? 'low_quality'] = (reasons[q.reason ?? 'low_quality'] ?? 0) + 1
        continue
      }
      accepted.push({
        vector: r.face.embedding,
        detScore: r.face.det_score,
        yaw: r.face.yaw,
        pitch: r.face.pitch,
        blurVar: r.face.blur_var,
      })
    }

    console.log(
      `[enroll-face] user=${userId} frames=${photos.length} accepted=${accepted.length} reasons=${JSON.stringify(reasons)}`
    )

    if (accepted.length < MIN_ACCEPTED_EMBEDDINGS) {
      throw new AuthServiceError(400, ErrorCodes.FACE_ENROLL_LOW_QUALITY, undefined, {
        accepted: accepted.length,
        needed: MIN_ACCEPTED_EMBEDDINGS,
        reasons,
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.faceEmbedding.deleteMany({ where: { userId } })
      await tx.faceEmbedding.createMany({
        data: accepted.map((a) => ({
          userId,
          vector: a.vector,
          detScore: a.detScore,
          yaw: a.yaw,
          pitch: a.pitch,
          blurVar: a.blurVar,
          faceModel: CURRENT_FACE_MODEL,
          source: 'enrollment',
        })),
      })
      await tx.user.update({
        where: { id: userId },
        data: { faceEnrolled: true, faceModel: CURRENT_FACE_MODEL, faceEnrolledAt: new Date() },
      })
    })

    return { success: true, accepted: accepted.length, total: photos.length }
  } catch (e) {
    if (e instanceof AuthServiceError) throw e
    console.error('[enroll-face]', e)
    const { code, message } = faceErrorFromException(e)
    throw new AuthServiceError(500, code, message)
  }
}

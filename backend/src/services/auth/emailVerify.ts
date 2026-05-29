import { prisma } from '../../lib/prisma.js'
import { markEmailVerified, issueEmailVerification } from '../../lib/emailVerify.js'
import { ErrorCodes } from '../../lib/apiErrors.js'
import { AuthServiceError } from './errors.js'

const lastResendAt = new Map<string, number>()

export async function verifyEmailWithToken(token: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true },
  })
  if (!user) {
    throw new AuthServiceError(400, ErrorCodes.EMAIL_VERIFY_TOKEN_INVALID)
  }
  await markEmailVerified(user.id)
}

export async function verifyEmailAndGetRedirect(token: string): Promise<string> {
  const appUrl = (process.env.APP_PUBLIC_URL ?? 'https://spectrmod.com').replace(/\/$/, '')
  if (!token) {
    return `${appUrl}/verify-email?error=invalid`
  }
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true },
  })
  if (!user) {
    return `${appUrl}/verify-email?error=invalid`
  }
  await markEmailVerified(user.id)
  return `${appUrl}/verify-email?verified=1`
}

export async function resendVerification(userId: string): Promise<{ success: true }> {
  const last = lastResendAt.get(userId) ?? 0
  if (Date.now() - last < 60_000) {
    throw new AuthServiceError(429, ErrorCodes.RESEND_COOLDOWN)
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, passwordHash: true },
  })
  if (!user || !user.passwordHash) {
    return { success: true }
  }
  if (user.emailVerifiedAt) {
    return { success: true }
  }
  try {
    await issueEmailVerification(userId, user.email)
    lastResendAt.set(userId, Date.now())
    return { success: true }
  } catch (e) {
    console.error('[resend-verification]', e)
    throw new AuthServiceError(500, ErrorCodes.EMAIL_SEND_FAILED)
  }
}

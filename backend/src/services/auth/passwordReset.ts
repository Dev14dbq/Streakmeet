import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { findUserByEmail } from '../../lib/accountDeletion.js'
import { generateToken } from '../../lib/emailVerify.js'
import { sendPasswordResetEmail } from '../../lib/email.js'
import { ErrorCodes } from '../../lib/apiErrors.js'
import { AuthServiceError } from './errors.js'

export async function forgotPassword(email: unknown): Promise<{ success: true }> {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new AuthServiceError(400, ErrorCodes.INVALID_EMAIL)
  }
  const normalizedEmail = email.toLowerCase().trim()
  const user = await findUserByEmail(normalizedEmail)

  if (!user || user.deletedAt) {
    return { success: true }
  }

  if (!user.passwordHash) {
    throw new AuthServiceError(400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)
  }

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
  if (!token || !password) {
    throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
  }
  if (password.length < 6) {
    throw new AuthServiceError(400, ErrorCodes.PASSWORD_TOO_SHORT)
  }
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpires: { gt: new Date() },
    },
  })
  if (!user) {
    throw new AuthServiceError(400, ErrorCodes.PASSWORD_RESET_TOKEN_INVALID)
  }
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

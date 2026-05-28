import crypto from 'crypto'
import { prisma } from './prisma.js'
import { sendVerificationEmail } from './email.js'

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const token = generateToken()
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: token,
      emailVerifiedAt: null,
    },
  })
  await sendVerificationEmail(email, token)
}

export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyToken: null,
    },
  })
}

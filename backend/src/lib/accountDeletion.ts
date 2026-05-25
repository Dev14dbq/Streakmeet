import { prisma } from './prisma.js'

export const ACCOUNT_RETENTION_DAYS = 30
const RETENTION_MS = ACCOUNT_RETENTION_DAYS * 86_400_000

export function isRetentionExpired(deletedAt: Date): boolean {
  return Date.now() - deletedAt.getTime() > RETENTION_MS
}

export function getDaysRemaining(deletedAt: Date): number {
  const remaining = RETENTION_MS - (Date.now() - deletedAt.getTime())
  return Math.max(0, Math.ceil(remaining / 86_400_000))
}

export function deletedAccountPayload(user: { email: string; deletedAt: Date }) {
  return {
    code: 'ACCOUNT_DELETED' as const,
    email: user.email,
    deletedAt: user.deletedAt.toISOString(),
    daysRemaining: getDaysRemaining(user.deletedAt),
  }
}

export async function purgeUser(userId: string): Promise<void> {
  await prisma.meetProof.deleteMany({ where: { uploadedById: userId } })
  await prisma.user.delete({ where: { id: userId } })
}

export async function purgeExpiredDeletedUsers(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS)
  const expired = await prisma.user.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
  })
  for (const user of expired) {
    await purgeUser(user.id)
  }
  return expired.length
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
  })
}

export async function findActiveUserByNickname(nickname: string) {
  return prisma.user.findFirst({
    where: { nickname: nickname.toLowerCase(), deletedAt: null },
  })
}

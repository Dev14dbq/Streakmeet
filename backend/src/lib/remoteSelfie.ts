import { prisma } from './prisma.js'

export const REMOTE_SELFIE_TTL_MS = 24 * 60 * 60 * 1000

export async function expireStaleRemoteSelfieRequests(streakId: string): Promise<void> {
  const cutoff = new Date(Date.now() - REMOTE_SELFIE_TTL_MS)
  await prisma.remoteSelfieRequest.updateMany({
    where: { streakId, status: 'PENDING', createdAt: { lt: cutoff } },
    data: { status: 'EXPIRED' },
  })
}

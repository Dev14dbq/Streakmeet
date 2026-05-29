import { REMOTE_SELFIE_TTL_MS } from './remoteSelfie.js'

export function pendingRemoteSelfiesInclude(userId: string) {
  const pendingSince = new Date(Date.now() - REMOTE_SELFIE_TTL_MS)
  return {
    where: {
      status: 'PENDING' as const,
      createdAt: { gte: pendingSince },
      OR: [{ receiverId: userId }, { senderId: userId }],
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: { select: { id: true, nickname: true } } },
  }
}

type PendingRemoteSelfieRow = {
  id: string
  senderId: string
  receiverId: string
  senderPhotoUrl: string
  sender: { id: string; nickname: string }
}

export function mapPendingRemoteSelfie(
  pending: PendingRemoteSelfieRow | undefined,
  userId: string
) {
  if (!pending) return null
  return {
    id: pending.id,
    senderId: pending.senderId,
    receiverId: pending.receiverId,
    senderPhotoUrl: pending.senderPhotoUrl,
    needsReply: pending.receiverId === userId,
    senderNickname: pending.sender.nickname,
  }
}

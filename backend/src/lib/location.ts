import { prisma } from './prisma.js'
import { partnerIdOf } from './relations.js'
import { broadcastToUsers } from './socket.js'

export interface FriendLocationPayload {
  id: string
  nickname: string
  avatarUrl: string | null
  latitude: number
  longitude: number
  updatedAt: string
}

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })

  return friendships.map((f) => partnerIdOf(f, userId))
}

export async function broadcastLocationToFriends(
  userId: string,
  payload: FriendLocationPayload
): Promise<void> {
  const friendIds = await getAcceptedFriendIds(userId)
  if (friendIds.length === 0) return
  broadcastToUsers(friendIds, 'friend:location', payload)
}

export async function broadcastLocationOffToFriends(userId: string): Promise<void> {
  const friendIds = await getAcceptedFriendIds(userId)
  if (friendIds.length === 0) return
  broadcastToUsers(friendIds, 'friend:location:off', { id: userId })
}

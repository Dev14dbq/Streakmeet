import type { FriendListItem } from '@streakmeet/api-spec'
import { migratedApi } from './migratedClient'

export const getFriends = () => migratedApi().get<FriendListItem[]>('/api/friends/')

export const requestFriend = (friendId: string) =>
  migratedApi().post('/api/friends/request', { friendId })

export const acceptFriend = (friendshipId: string) =>
  migratedApi().post('/api/friends/accept', { friendshipId })

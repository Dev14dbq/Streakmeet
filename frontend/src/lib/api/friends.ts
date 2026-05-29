import type { FriendListItem } from '@streakmeet/api-spec'
import { api } from './client'

export const getFriends = () => api.get<FriendListItem[]>('/api/friends')
export const requestFriend = (friendId: string) => api.post('/api/friends/request', { friendId })
export const acceptFriend = (friendshipId: string) =>
  api.post('/api/friends/accept', { friendshipId })

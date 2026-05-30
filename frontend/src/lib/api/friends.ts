import type { FriendListItem } from '@streakmeet/api-spec'
import axios from 'axios'
import { api } from './client'
import { getRustGatewayUrl, isSyncStreamEnabled } from '../connect/client'

function rustFriendsClient() {
  const client = axios.create({
    baseURL: getRustGatewayUrl(),
    headers: { 'Content-Type': 'application/json' },
  })
  const token = localStorage.getItem('accessToken')
  if (token) client.defaults.headers.common.Authorization = `Bearer ${token}`
  return client
}

function friendsClient() {
  return isSyncStreamEnabled() ? rustFriendsClient() : api
}

export const getFriends = () => friendsClient().get<FriendListItem[]>('/api/friends/')

export const requestFriend = (friendId: string) =>
  friendsClient().post('/api/friends/request', { friendId })

export const acceptFriend = (friendshipId: string) =>
  friendsClient().post('/api/friends/accept', { friendshipId })

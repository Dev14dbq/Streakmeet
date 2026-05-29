import type { FriendLocation, MyLocationState } from '@streakmeet/api-spec'
import { api } from './client'

export const getFriendLocations = () => api.get<FriendLocation[]>('/api/location/friends')
export const getMyLocation = () => api.get<MyLocationState>('/api/location/me')
export const setLocationSharing = (enabled: boolean) =>
  api.post<MyLocationState>('/api/location/sharing', { enabled })
export const updateMyLocation = (latitude: number, longitude: number) =>
  api.post<{ ok: true }>('/api/location/update', { latitude, longitude })

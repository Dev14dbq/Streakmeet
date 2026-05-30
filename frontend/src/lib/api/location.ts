import type { FriendLocation, MyLocationState } from '@streakmeet/api-spec'
import { migratedApi } from './migratedClient'

const locationApi = () => migratedApi()

export const getFriendLocations = () => locationApi().get<FriendLocation[]>('/api/location/friends')
export const getMyLocation = () => locationApi().get<MyLocationState>('/api/location/me')
export const setLocationSharing = (enabled: boolean) =>
  locationApi().post<MyLocationState>('/api/location/sharing', { enabled })
export const updateMyLocation = (latitude: number, longitude: number) =>
  locationApi().post<{ ok: true }>('/api/location/update', { latitude, longitude })

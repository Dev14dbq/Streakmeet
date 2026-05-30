import type { AuthUser } from '@streakmeet/api-spec'
import { getDeviceTimezone } from '../timezone'
import { api } from './client'
import { migratedApi } from './migratedClient'

const usersApi = () => migratedApi()

export const deleteAccount = () => api.delete<{ success: boolean }>('/api/users/me')

export const updatePreferences = (prefs: {
  notifyFriends?: boolean
  notifyMeet?: boolean
  geoOnPhotos?: boolean
}) => api.patch<AuthUser>('/api/users/preferences', prefs)

export const searchUsers = (q: string) =>
  usersApi().get<AuthUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`)

export const uploadAvatar = (photoBase64: string) =>
  api.post<{ avatarUrl: string }>('/api/users/avatar', { photoBase64 })

export const updateEmail = (email: string, currentPassword: string) =>
  api.patch<AuthUser>('/api/users/email', { email, currentPassword })

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.patch<{ success: true }>('/api/users/password', { currentPassword, newPassword })

export const updateSettings = (timezone: string) =>
  api.patch<AuthUser & { timezone: string }>('/api/users/settings', { timezone })

export const updatePublicProfile = (isPublic: boolean) =>
  api.patch<AuthUser>('/api/users/public', { isPublic })

export const getMyPhotos = () => api.get<any[]>('/api/users/photos')

/** Синхронизирует часовой пояс устройства с профилем */
export async function syncDeviceTimezone(): Promise<string> {
  const timezone = getDeviceTimezone()
  await updateSettings(timezone)
  return timezone
}

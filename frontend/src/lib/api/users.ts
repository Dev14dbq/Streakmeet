import type { AuthUser } from '@streakmeet/api-spec'
import { getDeviceTimezone } from '../timezone'
import { migratedApi, nodeApi } from './migratedClient'

const usersApi = () => migratedApi()

export const deleteAccount = () => nodeApi().delete<{ success: boolean }>('/api/users/me')

export const updatePreferences = (prefs: {
  notifyFriends?: boolean
  notifyMeet?: boolean
  geoOnPhotos?: boolean
}) => usersApi().patch<AuthUser>('/api/users/preferences', prefs)

export const searchUsers = (q: string) =>
  usersApi().get<AuthUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`)

export const uploadAvatar = (photoBase64: string) =>
  usersApi().post<{ avatarUrl: string }>('/api/users/avatar', { photoBase64 })

export const updateEmail = (email: string, currentPassword: string) =>
  usersApi().patch<AuthUser>('/api/users/email', { email, currentPassword })

export const changePassword = (currentPassword: string, newPassword: string) =>
  usersApi().patch<{ success: true }>('/api/users/password', { currentPassword, newPassword })

export const updateSettings = (timezone: string) =>
  usersApi().patch<AuthUser & { timezone: string }>('/api/users/settings', { timezone })

export const updatePublicProfile = (isPublic: boolean) =>
  usersApi().patch<AuthUser>('/api/users/me', { isPublic })

export const getMyPhotos = () => usersApi().get<unknown[]>('/api/users/photos')

/** Синхронизирует часовой пояс устройства с профилем */
export async function syncDeviceTimezone(): Promise<string> {
  const timezone = getDeviceTimezone()
  await updateSettings(timezone)
  return timezone
}

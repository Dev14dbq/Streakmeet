import axios from 'axios'
import { getDeviceTimezone } from './timezone'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// SWR Fetcher
export const fetcher = (url: string) => api.get(url).then((res) => res.data)

// Auth
export const checkEmail = (email: string) =>
  api.post<{ exists: boolean }>('/api/auth/check-email', { email })

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/api/auth/login', { email, password, timezone: getDeviceTimezone() })

export const restoreAccount = (payload: RestoreAccountPayload) =>
  api.post<AuthResponse>('/api/auth/restore-account', payload)

export const deleteAccount = () => api.delete<{ success: boolean }>('/api/users/me')

export const register = (data: RegisterPayload) =>
  api.post<AuthResponse>('/api/auth/register', data)

export interface AuthUser {
  id: string
  email: string
  nickname: string
  qrCodeId?: string
  gemsBalance?: number
  faceEnrolled: boolean
  avatarUrl?: string
  timezone?: string
  isPublic?: boolean
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

export interface RegisterPayload {
  email: string
  password: string
  nickname: string
  username: string
  timezone?: string
}

export interface DeletedAccountInfo {
  code: 'ACCOUNT_DELETED'
  email: string
  deletedAt: string
  daysRemaining: number
}

export type RestoreAccountPayload =
  | { email: string; password: string }
  | { provider: 'google'; accessToken?: string; idToken?: string }
  | { provider: 'apple'; idToken: string }

export function getDeletedAccountInfo(err: unknown): DeletedAccountInfo | null {
  const data = (err as { response?: { status?: number; data?: DeletedAccountInfo } })?.response
  if (data?.status === 403 && data.data?.code === 'ACCOUNT_DELETED') {
    return data.data
  }
  return null
}

export const searchUsers = (q: string) => api.get<AuthUser[]>(`/api/users/search?q=${q}`)
export const uploadAvatar = (photoBase64: string) =>
  api.post<{ avatarUrl: string }>('/api/users/avatar', { photoBase64 })
export const updateEmail = (email: string) => api.patch<AuthUser>('/api/users/email', { email })

export const updateSettings = (timezone: string) =>
  api.patch<AuthUser & { timezone: string }>('/api/users/settings', { timezone })

export const updatePublicProfile = (isPublic: boolean) =>
  api.patch<AuthUser>('/api/users/public', { isPublic })

/** Синхронизирует часовой пояс устройства с профилем */
export async function syncDeviceTimezone(): Promise<string> {
  const timezone = getDeviceTimezone()
  await updateSettings(timezone)
  return timezone
}
export const getMyPhotos = () => api.get<any[]>('/api/users/photos')
export const getFriends = () => api.get<any[]>('/api/friends')
export const requestFriend = (friendId: string) => api.post('/api/friends/request', { friendId })
export const acceptFriend = (friendshipId: string) =>
  api.post('/api/friends/accept', { friendshipId })

export const getStreaks = () => api.get<any[]>('/api/streaks')
export const getStreak = (partnerNickname: string) =>
  api.get<any>(`/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}`)
export const createStreak = (partnerId: string) => api.post('/api/streaks', { partnerId })
export const remindStreak = (partnerNickname: string) =>
  api.post<{ ok: true }>(`/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}/remind`)

export const initRemoteSelfie = (streakId: string, photoBase64: string) =>
  api.post(`/api/streaks/${streakId}/remote-selfie/init`, { photoBase64 })

export const replyRemoteSelfie = (streakId: string, requestId: string, photoBase64: string) =>
  api.post<{ success: boolean; photoUrl: string }>(
    `/api/streaks/${streakId}/remote-selfie/reply/${requestId}`,
    { photoBase64 }
  )

export interface FriendLocation {
  id: string
  nickname: string
  avatarUrl: string | null
  latitude: number
  longitude: number
  updatedAt: string
}

export interface MyLocationState {
  sharingLocation: boolean
  latitude: number | null
  longitude: number | null
  updatedAt: string | null
}

export const getFriendLocations = () => api.get<FriendLocation[]>('/api/location/friends')
export const getMyLocation = () => api.get<MyLocationState>('/api/location/me')
export const setLocationSharing = (enabled: boolean) =>
  api.post<MyLocationState>('/api/location/sharing', { enabled })
export const updateMyLocation = (latitude: number, longitude: number) =>
  api.post<{ ok: true }>('/api/location/update', { latitude, longitude })
export interface MagicMeetPartner {
  nickname: string
  avatarUrl?: string | null
}

export interface MagicMeetResponse {
  message: string
  partners: MagicMeetPartner[]
}

export const magicMeet = (payload: {
  photoBase64: string
  location?: { lat: number; lng: number }
}) => api.post<MagicMeetResponse>('/api/streaks/magic-meet', payload, { timeout: 120_000 })

export const enrollFace = (photos: string[]) =>
  api.post('/api/auth/enroll-face', { photos }, { timeout: 120_000 })

export interface PublicUser {
  id: string
  nickname: string
  avatarUrl?: string | null
  isPublic?: boolean
}

export type PublicFriendship =
  | { status: 'SELF' }
  | { id: string; status: 'PENDING' | 'ACCEPTED' | 'BLOCKED'; isIncoming: boolean }
  | null

export interface PublicProfile {
  user: PublicUser
  friendship: PublicFriendship
}

export const RESERVED_PATHS = new Set([
  'login',
  'register',
  'map',
  'memories',
  'friends',
  'profile',
  'settings',
  'streaks',
  'magic-meet',
  'face-enrollment',
  'account-deleted',
  'uploads',
  'api',
  '404',
])

export function isPublicNicknamePath(segment: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(segment) && !RESERVED_PATHS.has(segment.toLowerCase())
}

export function publicAppOrigin(): string {
  const configured = import.meta.env.VITE_API_URL
  if (configured) return configured.replace(/\/$/, '')
  return window.location.origin
}

/** URL для Socket.io — на Android в WebView origin = localhost, нужен реальный сервер. */
export function getRealtimeServerUrl(): string {
  return publicAppOrigin()
}

export function profileUrl(nickname: string): string {
  return `${publicAppOrigin()}/${nickname.toLowerCase()}`
}

/** Profile URL, legacy /add/:qrCodeId, or raw nickname/qr id from QR scan. */
export function parseQrScanTarget(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL(trimmed, publicAppOrigin())
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length === 1 && isPublicNicknamePath(parts[0]!)) {
      return parts[0]!.toLowerCase()
    }
    if (parts[0] === 'add' && parts[1]) {
      return parts[1]
    }
  } catch {
    // not a URL
  }

  if (isPublicNicknamePath(trimmed)) return trimmed.toLowerCase()
  return trimmed
}

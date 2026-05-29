import axios, { isAxiosError } from 'axios'
import i18n from '../i18n'
import type {
  AuthResponse,
  AuthUser,
  DeletedAccountInfo,
  FriendLocation,
  LegalConsentStatus,
  LegalDocument,
  MagicMeetResponse,
  MyLocationState,
  RegisterPayload,
  RestoreAccountPayload,
} from '@streakmeet/api-spec'
import { getDeviceTimezone } from './timezone'

export type {
  AuthResponse,
  AuthUser,
  DeletedAccountInfo,
  FriendLocation,
  LegalConsentStatus,
  LegalDocument,
  MagicMeetPartner,
  MagicMeetResponse,
  MyLocationState,
  PublicFriendship,
  PublicProfile,
  PublicUser,
  RegisterPayload,
  RestoreAccountPayload,
} from '@streakmeet/api-spec'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code
    // 403 + ACCOUNT_DELETED обрабатывается вызывающим кодом (restore flow)
    if (status === 401 && code !== 'ACCOUNT_DELETED') {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
      onUnauthorized?.()
    }
    return Promise.reject(error)
  }
)

/** Extracts a human-readable message from API response (translated when possible) */
export function getApiErrorMessage(err: unknown, fallback?: string): string {
  const fb = fallback ?? i18n.t('errors.generic')
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; code?: string } | undefined
    if (typeof data?.code === 'string' && data.code.trim()) {
      const codeKey = `errors.${data.code}`
      if (i18n.exists(codeKey)) return i18n.t(codeKey)
    }
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error
    }
    if (err.code === 'ECONNABORTED') return i18n.t('errors.timeout')
    if (!err.response) return i18n.t('errors.noConnection')
  }
  if (err instanceof Error && err.message) return err.message
  return fb
}

/** Ищет пользователя по точному @nickname или qrCodeId */
export function findUserByScanTarget(
  users: { id: string; nickname: string; qrCodeId?: string }[],
  target: string
) {
  const normalized = target.toLowerCase()
  return (
    users.find((u) => u.nickname === normalized) ?? users.find((u) => u.qrCodeId === target) ?? null
  )
}

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

export const resendVerificationEmail = () =>
  api.post<{ success: true }>('/api/auth/resend-verification')

export const confirmEmailVerification = (token: string) =>
  api.post<{ success: true }>('/api/auth/verify-email', { token })

export const forgotPassword = (email: string) =>
  api.post<{ success: true }>('/api/auth/forgot-password', { email })

export const resetPassword = (token: string, password: string) =>
  api.post<{ success: true }>('/api/auth/reset-password', { token, password })

export const updatePreferences = (prefs: {
  notifyFriends?: boolean
  notifyMeet?: boolean
  geoOnPhotos?: boolean
}) => api.patch<AuthUser>('/api/users/preferences', prefs)

export function getDeletedAccountInfo(err: unknown): DeletedAccountInfo | null {
  const data = (err as { response?: { status?: number; data?: DeletedAccountInfo } })?.response
  if ((data?.status === 403 || data?.status === 409) && data.data?.code === 'ACCOUNT_DELETED') {
    return data.data
  }
  return null
}

export const searchUsers = (q: string) =>
  api.get<AuthUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`)
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

export const getLegalDocument = (slug: 'terms' | 'privacy', locale?: string) =>
  api.get<LegalDocument>(`/api/legal/${slug}`, {
    params: locale ? { locale } : undefined,
  })

export const getLegalConsentStatus = () => api.get<LegalConsentStatus>('/api/legal/status/me')

export const acceptLegalDocuments = () =>
  api.post<{ ok: true; terms: number; privacy: number }>('/api/legal/accept')

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

export const getFriendLocations = () => api.get<FriendLocation[]>('/api/location/friends')
export const getMyLocation = () => api.get<MyLocationState>('/api/location/me')
export const setLocationSharing = (enabled: boolean) =>
  api.post<MyLocationState>('/api/location/sharing', { enabled })
export const updateMyLocation = (latitude: number, longitude: number) =>
  api.post<{ ok: true }>('/api/location/update', { latitude, longitude })

export const magicMeet = (payload: {
  photoBase64?: string
  photosBase64?: string[]
  location?: { lat: number; lng: number }
}) => api.post<MagicMeetResponse>('/api/streaks/magic-meet', payload, { timeout: 120_000 })

export const enrollFace = (photos: string[]) =>
  api.post('/api/auth/enroll-face', { photos }, { timeout: 120_000 })

export const RESERVED_PATHS = new Set([
  'login',
  'register',
  'verify-email',
  'forgot-password',
  'reset-password',
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

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

import { getNodeApiUrl } from './api/client'
import { isSyncStreamEnabled } from './connect/syncMode'

export function publicAppOrigin(): string {
  const configured = import.meta.env.VITE_API_URL
  if (configured) return configured.replace(/\/$/, '')
  return window.location.origin
}

/** URL для Socket.io — Node only; when Rust sync is on, point at the legacy backend. */
export function getRealtimeServerUrl(): string {
  if (isSyncStreamEnabled()) {
    const node = getNodeApiUrl()
    if (node) return node
  }
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

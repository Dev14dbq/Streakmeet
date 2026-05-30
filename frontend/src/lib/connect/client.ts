import { createConnectTransport, type ConnectTransportOptions } from '@connectrpc/connect-web'
import { getAccessToken } from '../../context/AuthContext'
export { initSyncMode, isSyncModeResolved, isSyncStreamEnabled, onSyncModeReady } from './syncMode'

/** Base URL for Connect/gRPC services (sync-gateway). Vite proxies `/connect` in dev. */
export function getConnectBaseUrl(): string {
  const configured = import.meta.env.VITE_CONNECT_URL as string | undefined
  if (configured?.trim()) return configured.replace(/\/$/, '')
  return '/connect'
}

/**
 * Rust REST gateway base URL. Empty string uses same-origin `/api` (Vite proxy → :8080 in dev).
 * Set VITE_RUST_GATEWAY_URL for Capacitor native or production gateway host.
 */
export function getRustGatewayUrl(): string {
  const configured = import.meta.env.VITE_RUST_GATEWAY_URL as string | undefined
  if (configured?.trim()) return configured.replace(/\/$/, '')
  return ''
}

export function createSyncTransport(overrides: Partial<ConnectTransportOptions> = {}) {
  return createConnectTransport({
    baseUrl: getConnectBaseUrl(),
    interceptors: [
      (next) => async (req) => {
        const token = getAccessToken()
        if (token) req.header.set('Authorization', `Bearer ${token}`)
        return next(req)
      },
    ],
    ...overrides,
  })
}

export const LAST_EVENT_ID_KEY = 'streakmeet:lastEventId'

export function readLastEventId(): string {
  return localStorage.getItem(LAST_EVENT_ID_KEY) ?? ''
}

export function persistLastEventId(eventId: string): void {
  if (eventId) localStorage.setItem(LAST_EVENT_ID_KEY, eventId)
}

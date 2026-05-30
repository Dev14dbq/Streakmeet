import { createConnectTransport, type ConnectTransportOptions } from '@connectrpc/connect-web'
import { getAccessToken } from '../../context/AuthContext'

/** Base URL for Connect/gRPC services (sync-gateway). Vite proxies `/connect` in dev. */
export function getConnectBaseUrl(): string {
  const configured = import.meta.env.VITE_CONNECT_URL as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  return '/connect'
}

/** Rust REST gateway (optional during migration). Falls back to Vite `/api` proxy → Node. */
export function getRustGatewayUrl(): string {
  const configured = import.meta.env.VITE_RUST_GATEWAY_URL as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  return 'http://127.0.0.1:8080'
}

export function isSyncStreamEnabled(): boolean {
  return import.meta.env.VITE_USE_SYNC_STREAM === 'true'
}

export function createSyncTransport(
  overrides: Partial<ConnectTransportOptions> = {}
) {
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

import { Capacitor } from '@capacitor/core'

/** Production API host (Rust gateway or legacy VITE_API_URL). */
export function getApiOrigin(): string {
  const rust = (import.meta.env.VITE_RUST_GATEWAY_URL as string | undefined)?.trim()
  if (rust) return rust.replace(/\/$/, '')
  const api = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (api) return api.replace(/\/$/, '')
  return window.location.origin.replace(/\/$/, '')
}

/** True when the SPA is served from the same origin as API (browser on spectrmod.com). */
export function isSameOriginApi(): boolean {
  if (Capacitor.isNativePlatform()) return false
  try {
    return new URL(getApiOrigin()).origin === window.location.origin
  } catch {
    return false
  }
}

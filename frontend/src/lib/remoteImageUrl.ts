import { getApiOrigin, isSameOriginApi } from './apiOrigin'

/** Full URL for backend media paths (`/uploads/...`) or already absolute. */
export function resolveBackendImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  // Capacitor / other hosts: must hit spectrmod.com (or VITE_API_URL), not capacitor://localhost.
  if (!isSameOriginApi()) {
    return `${getApiOrigin()}${normalized}`
  }
  return normalized
}

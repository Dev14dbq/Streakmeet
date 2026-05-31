/** Full URL for backend media paths (`/uploads/...`) or already absolute. */
export function resolveBackendImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  // Same-origin relative URL — nginx proxies /uploads to api-gateway; avoids VITE_API_URL mismatches.
  if (normalized.startsWith('/uploads/')) return normalized
  const base =
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin
  return `${base.replace(/\/$/, '')}${normalized}`
}

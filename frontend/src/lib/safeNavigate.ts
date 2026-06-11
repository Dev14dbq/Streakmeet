/** Allow only same-origin relative paths (blocks open redirects). */
export function safeInternalPath(path: string | undefined | null): string | null {
  if (!path || typeof path !== 'string') return null

  const trimmed = path.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  if (/^\/https?:/i.test(trimmed)) return null

  try {
    const url = new URL(trimmed, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

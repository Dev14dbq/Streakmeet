/** Полный URL для пути с бэкенда (`/uploads/...`) или уже абсолютного. */
export function resolveBackendImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = import.meta.env.VITE_API_URL || window.location.origin
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

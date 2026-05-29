/** Только смартфоны — не планшеты и не десктоп. */
export function isMobilePhone(): boolean {
  const ua = navigator.userAgent

  if (/iPhone|iPod/i.test(ua)) return true
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true
  if (/webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true

  return false
}

/** Routes reachable from desktop (e.g. email confirmation links). */
export const MOBILE_GATE_EXEMPT_PATHS = ['/verify-email'] as const

export function isMobileGateExemptPath(pathname: string): boolean {
  return MOBILE_GATE_EXEMPT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function requiresMobileGate(pathname?: string): boolean {
  if (import.meta.env.VITE_SKIP_MOBILE_GATE === 'true') return false
  if (pathname && isMobileGateExemptPath(pathname)) return false
  return !isMobilePhone()
}

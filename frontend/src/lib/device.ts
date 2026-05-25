/** Только смартфоны — не планшеты и не десктоп. */
export function isMobilePhone(): boolean {
  const ua = navigator.userAgent

  if (/iPhone|iPod/i.test(ua)) return true
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true
  if (/webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true

  return false
}

export function requiresMobileGate(): boolean {
  if (import.meta.env.VITE_SKIP_MOBILE_GATE === 'true') return false
  return !isMobilePhone()
}

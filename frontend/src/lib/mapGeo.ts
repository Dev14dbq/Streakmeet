import { Capacitor } from '@capacitor/core'
import { openExternalUrl } from './alwaysLocationPermission'

const geocodeCache = new Map<string, string>()

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} км`
  return `${Math.round(meters / 1000)} км`
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  const cached = geocodeCache.get(key)
  if (cached) return cached

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'json')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')

    const res = await fetch(url.toString(), {
      headers: {
        'Accept-Language': 'ru',
        'User-Agent': 'StreakMeet/1.0 (map reverse geocode)',
      },
    })
    if (!res.ok) throw new Error('geocode failed')
    const data = (await res.json()) as { display_name?: string }
    const label = data.display_name?.trim() || formatCoords(lat, lng)
    geocodeCache.set(key, label)
    return label
  } catch {
    return formatCoords(lat, lng)
  }
}

/** Открывает системный выбор приложения для маршрута (Android) или карты (iOS). */
export async function openNavigationRoute(opts: {
  lat: number
  lng: number
  label?: string
  originLat?: number
  originLng?: number
}): Promise<void> {
  const { lat, lng, label = 'StreakMeet', originLat, originLng } = opts
  const dest = `${lat},${lng}`
  const platform = Capacitor.getPlatform()

  if (platform === 'android') {
    const q = encodeURIComponent(`${dest}(${label})`)
    await openExternalUrl(`geo:${dest}?q=${q}`)
    return
  }

  if (platform === 'ios') {
    const origin = originLat != null && originLng != null ? `&saddr=${originLat},${originLng}` : ''
    await openExternalUrl(`maps://?daddr=${dest}${origin}&dirflg=d`)
    return
  }

  const origin = originLat != null && originLng != null ? `&origin=${originLat},${originLng}` : ''
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin}`,
    '_blank',
    'noopener'
  )
}

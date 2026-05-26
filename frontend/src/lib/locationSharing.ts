import { Capacitor, registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { setLocationSharing, updateMyLocation, getMyLocation } from './api'
import { requestAlwaysLocationPermission } from './alwaysLocationPermission'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

let watcherId: string | null = null
let lastSentAt = 0
let lastSentLat: number | null = null
let lastSentLng: number | null = null

const MIN_SEND_INTERVAL_MS = 4_000
const MIN_MOVE_METERS = 3

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function pushLocation(latitude: number, longitude: number): Promise<void> {
  const now = Date.now()
  if (now - lastSentAt < MIN_SEND_INTERVAL_MS) {
    if (lastSentLat != null && lastSentLng != null) {
      if (metersBetween(lastSentLat, lastSentLng, latitude, longitude) < MIN_MOVE_METERS) {
        return
      }
    } else {
      return
    }
  }

  lastSentAt = now
  lastSentLat = latitude
  lastSentLng = longitude
  await updateMyLocation(latitude, longitude)
}

async function startWatcher(): Promise<void> {
  if (!Capacitor.isNativePlatform() || watcherId) return

  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'StreakMeet',
      backgroundMessage: 'Трансляция геолокации для друзей',
      requestPermissions: false,
      stale: false,
      distanceFilter: 0,
    },
    (location, error) => {
      if (error) {
        console.warn('[location-sharing]', error.code ?? error.message)
        return
      }
      if (!location) return
      void pushLocation(location.latitude, location.longitude).catch((e) => {
        console.warn('[location-sharing] update failed', e)
      })
    }
  )
}

async function stopWatcher(): Promise<void> {
  if (!watcherId) return
  const id = watcherId
  watcherId = null
  await BackgroundGeolocation.removeWatcher({ id })
}

export async function ensureLocationPermission(): Promise<boolean> {
  try {
    return await requestAlwaysLocationPermission()
  } catch {
    return false
  }
}

export async function startLocationSharing(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('native_only')
  }

  try {
    await requestAlwaysLocationPermission()
  } catch (e) {
    if (e instanceof Error && e.message === 'not_always') throw e
    throw new Error('permission_denied')
  }

  await setLocationSharing(true)

  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    })
    await pushLocation(pos.coords.latitude, pos.coords.longitude)
  } catch {
    /* watcher доставит первую точку */
  }

  await startWatcher()
}

export async function stopLocationSharing(): Promise<void> {
  await stopWatcher()
  lastSentAt = 0
  lastSentLat = null
  lastSentLng = null
  if (Capacitor.isNativePlatform()) {
    await setLocationSharing(false)
  }
}

export async function resumeLocationSharingIfNeeded(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { data } = await getMyLocation()
    if (!data.sharingLocation) return
    const granted = await ensureLocationPermission()
    if (!granted) return
    await startWatcher()
  } catch {
    /* ignore */
  }
}

export function isLocationSharingActive(): boolean {
  return watcherId != null
}

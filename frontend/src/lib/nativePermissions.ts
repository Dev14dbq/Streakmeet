import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { ensureNotificationPermission } from './streakNotifications'

const PROMPT_KEY = 'streakmeet_essential_permissions_prompted'

let promptInFlight: Promise<void> | null = null

export async function ensureCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const current = await Camera.checkPermissions()
  if (current.camera === 'granted') return true
  const requested = await Camera.requestPermissions({ permissions: ['camera'] })
  return requested.camera === 'granted'
}

/** Запрашивает камеру и уведомления один раз при первом входе в нативное приложение. */
export async function promptEssentialPermissionsOnFirstLaunch(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (localStorage.getItem(PROMPT_KEY) === '1') return

  if (promptInFlight) return promptInFlight

  promptInFlight = (async () => {
    await ensureCameraPermission()
    await ensureNotificationPermission()
    localStorage.setItem(PROMPT_KEY, '1')
  })().finally(() => {
    promptInFlight = null
  })

  return promptInFlight
}

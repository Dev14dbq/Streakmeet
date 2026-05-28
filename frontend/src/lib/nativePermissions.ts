import { Capacitor } from '@capacitor/core'
import { ensureNotificationPermission } from './streakNotifications'

const PROMPT_KEY = 'streakmeet_essential_permissions_prompted'

let promptInFlight: Promise<void> | null = null

/** Уведомления при первом входе. Камеру запрашиваем на экране регистрации лица / в камере meet. */
export async function promptEssentialPermissionsOnFirstLaunch(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (localStorage.getItem(PROMPT_KEY) === '1') return

  if (promptInFlight) return promptInFlight

  promptInFlight = (async () => {
    await ensureNotificationPermission()
    localStorage.setItem(PROMPT_KEY, '1')
  })().finally(() => {
    promptInFlight = null
  })

  return promptInFlight
}

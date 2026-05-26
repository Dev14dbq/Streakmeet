import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AlwaysLocationStatus {
  granted: boolean
  foreground: boolean
  background: boolean
}

interface StreakLocationPermissionPlugin {
  checkAlways(): Promise<AlwaysLocationStatus>
  requestAlways(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
  openExternalUrl(options: { url: string }): Promise<void>
}

const StreakLocationPermission = registerPlugin<StreakLocationPermissionPlugin>(
  'StreakLocationPermission'
)

/** Проверяет, что выдано «всегда», а не только «при использовании». */
export async function checkAlwaysLocationPermission(): Promise<AlwaysLocationStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false, foreground: false, background: false }
  }
  return StreakLocationPermission.checkAlways()
}

/** Запрашивает «Разрешить всегда» (Android: два шага, iOS: Always). */
export async function requestAlwaysLocationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  const current = await checkAlwaysLocationPermission()
  if (current.granted) return true

  try {
    await StreakLocationPermission.requestAlways()
    const after = await checkAlwaysLocationPermission()
    if (after.granted) return true
    if (after.foreground && !after.background) {
      throw new Error('not_always')
    }
    throw new Error('permission_denied')
  } catch (e) {
    const code = (e as { code?: string })?.code
    if (code === 'NOT_ALWAYS') throw new Error('not_always')
    if (code === 'PERMISSION_DENIED' || code === 'background_denied') {
      throw new Error('permission_denied')
    }
    if (e instanceof Error && (e.message === 'not_always' || e.message === 'permission_denied')) {
      throw e
    }
    throw new Error('permission_denied')
  }
}

export async function openAlwaysLocationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await StreakLocationPermission.openSettings()
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener')
    return
  }
  await StreakLocationPermission.openExternalUrl({ url })
}

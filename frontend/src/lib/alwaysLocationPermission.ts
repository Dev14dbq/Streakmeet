import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AlwaysLocationStatus {
  granted: boolean
  foreground: boolean
  background: boolean
  denied: boolean
}

interface StreakLocationPermissionPlugin {
  checkAlways(): Promise<AlwaysLocationStatus>
  requestAlways(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
  openExternalUrl(options: { url: string }): Promise<void>
  showAlwaysPrompt(options: {
    title: string
    message: string
    cancelLabel: string
    actionLabel: string
    actionType: 'continue' | 'settings'
  }): Promise<{ action: 'continue' | 'settings' | 'cancel' }>
}

const StreakLocationPermission = registerPlugin<StreakLocationPermissionPlugin>(
  'StreakLocationPermission'
)

/** Проверяет, что выдано «всегда», а не только «при использовании». */
export async function checkAlwaysLocationPermission(): Promise<AlwaysLocationStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: false, foreground: false, background: false, denied: false }
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

export async function showNativeAlwaysPrompt(options: {
  title: string
  message: string
  cancelLabel: string
  actionLabel: string
  actionType: 'continue' | 'settings'
}): Promise<'continue' | 'settings' | 'cancel'> {
  if (!Capacitor.isNativePlatform()) return 'continue'
  const { action } = await StreakLocationPermission.showAlwaysPrompt(options)
  return action
}

export type AlwaysLocationPromptResult = 'granted' | 'cancelled' | 'settings'

/** Native alert → system dialog or Settings for «Always» location. */
export async function promptAlwaysLocationAccess(options: {
  title: string
  message: string
  settingsMessage: string
  cancelLabel: string
  continueLabel: string
  settingsLabel: string
}): Promise<AlwaysLocationPromptResult> {
  if (!Capacitor.isNativePlatform()) return 'cancelled'

  const status = await checkAlwaysLocationPermission()
  if (status.granted) return 'granted'

  const needsSettings = status.denied || (status.foreground && !status.background)

  const action = await showNativeAlwaysPrompt({
    title: options.title,
    message: needsSettings ? options.settingsMessage : options.message,
    cancelLabel: options.cancelLabel,
    actionLabel: needsSettings ? options.settingsLabel : options.continueLabel,
    actionType: needsSettings ? 'settings' : 'continue',
  })

  if (action === 'cancel') return 'cancelled'
  if (action === 'settings') return 'settings'

  try {
    const granted = await requestAlwaysLocationPermission()
    return granted ? 'granted' : 'cancelled'
  } catch (e) {
    const code = e instanceof Error ? e.message : ''
    if (code !== 'not_always' && code !== 'permission_denied') throw e

    const followUp = await showNativeAlwaysPrompt({
      title: options.title,
      message: options.settingsMessage,
      cancelLabel: options.cancelLabel,
      actionLabel: options.settingsLabel,
      actionType: 'settings',
    })
    return followUp === 'cancel' ? 'cancelled' : 'settings'
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener')
    return
  }
  await StreakLocationPermission.openExternalUrl({ url })
}

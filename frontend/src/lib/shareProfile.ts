import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { isMobilePhone } from './device'

export type ShareProfileResult = 'shared' | 'copied' | 'cancelled' | 'failed'

function isShareCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const lower = message.toLowerCase()
  return lower.includes('cancel') || lower.includes('abort') || lower.includes('dismiss')
}

export async function shareProfileLink(nickname: string, url: string): Promise<ShareProfileResult> {
  const text = `Мой профиль в StreakMeet — @${nickname}`
  const payload = { title: 'StreakMeet', text, url }

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ ...payload, dialogTitle: 'Поделиться профилем' })
      return 'shared'
    } catch (error) {
      if (isShareCancelled(error)) return 'cancelled'
    }
  } else if (isMobilePhone() && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (error) {
      if (isShareCancelled(error)) return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Вибрация при тапе «Напомнить» — на Android через нативный мотор, в браузере через Vibration API. */
export function vibrateRemind(combo: number): void {
  void vibrateRemindAsync(combo)
}

async function vibrateRemindAsync(combo: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (combo >= 15) {
      await Haptics.notification({ type: NotificationType.Warning })
      await delay(70)
      await Haptics.impact({ style: ImpactStyle.Heavy })
      await delay(55)
      await Haptics.vibrate({ duration: 420 })
      return
    }
    if (combo >= 8) {
      await Haptics.notification({ type: NotificationType.Warning })
      await delay(50)
      await Haptics.impact({ style: ImpactStyle.Heavy })
      await Haptics.vibrate({ duration: 320 })
      return
    }
    if (combo >= 4) {
      await Haptics.impact({ style: ImpactStyle.Heavy })
      await delay(40)
      await Haptics.vibrate({ duration: 240 })
      return
    }
    await Haptics.impact({ style: ImpactStyle.Heavy })
    await Haptics.vibrate({ duration: 180 })
    return
  }

  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  if (combo >= 15) {
    navigator.vibrate([0, 90, 55, 90, 55, 110, 70, 130])
  } else if (combo >= 8) {
    navigator.vibrate([0, 75, 45, 75, 55, 100])
  } else if (combo >= 4) {
    navigator.vibrate([0, 65, 40, 80])
  } else {
    navigator.vibrate([0, 80])
  }
}

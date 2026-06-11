import { Capacitor } from '@capacitor/core'
import { AdMob, RewardedAd } from '@capgo/capacitor-admob'

const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917'
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313'

const REWARDED_ANDROID =
  import.meta.env.VITE_ADMOB_REWARDED_ANDROID ?? 'ca-app-pub-7075459475007291/798653455'

function rewardedUnitId(): string {
  const platform = Capacitor.getPlatform()
  if (import.meta.env.DEV) {
    return platform === 'ios' ? TEST_REWARDED_IOS : TEST_REWARDED_ANDROID
  }
  return platform === 'ios'
    ? (import.meta.env.VITE_ADMOB_REWARDED_IOS ?? TEST_REWARDED_IOS)
    : REWARDED_ANDROID
}

/**
 * Shows a rewarded ad. Resolves when the user earns the reward.
 * On web dev without native ads, resolves immediately (server still enforces limits).
 */
export async function showRewardedAdForStreakRestore(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    if (import.meta.env.DEV) return
    throw new Error('ADS_NATIVE_ONLY')
  }

  const ad = new RewardedAd({ adUnitId: rewardedUnitId() })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      void Promise.all(handles.map((h) => h.remove())).finally(fn)
    }

    const handles: { remove: () => Promise<void> }[] = []

    void (async () => {
      try {
        handles.push(
          await AdMob.addListener('rewarded.reward', () => {
            finish(resolve)
          })
        )
        handles.push(
          await AdMob.addListener('rewarded.dismiss', () => {
            finish(() => reject(new Error('ADS_CLOSED')))
          })
        )
        handles.push(
          await AdMob.addListener('rewarded.loadfail', () => {
            finish(() => reject(new Error('ADS_FAILED')))
          })
        )
        handles.push(
          await AdMob.addListener('rewarded.showfail', () => {
            finish(() => reject(new Error('ADS_FAILED')))
          })
        )

        await ad.load()
        await ad.show()
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error('ADS_FAILED')))
      }
    })()
  })
}

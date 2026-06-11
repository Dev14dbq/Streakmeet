import { Capacitor } from '@capacitor/core'
import { AdMob, InterstitialAd } from '@capgo/capacitor-admob'

const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712'
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910'

const INTERSTITIAL_ANDROID =
  import.meta.env.VITE_ADMOB_INTERSTITIAL_ANDROID ?? 'ca-app-pub-7075459475007291/3089549995'

function interstitialUnitId(): string {
  const platform = Capacitor.getPlatform()
  if (import.meta.env.DEV) {
    return platform === 'ios' ? TEST_INTERSTITIAL_IOS : TEST_INTERSTITIAL_ANDROID
  }
  return platform === 'ios'
    ? (import.meta.env.VITE_ADMOB_INTERSTITIAL_IOS ?? TEST_INTERSTITIAL_IOS)
    : INTERSTITIAL_ANDROID
}

let preloaded: InterstitialAd | null = null

/** Preload while the camera is open so the ad is ready right after shutter. */
export function preloadInterstitialAfterPhoto(): void {
  if (!Capacitor.isNativePlatform()) return
  const ad = new InterstitialAd({ adUnitId: interstitialUnitId() })
  preloaded = ad
  void ad.load().catch(() => {
    if (preloaded === ad) preloaded = null
  })
}

/**
 * Full-screen interstitial after capture, before server verification.
 * Fails open: if the ad cannot load/show, continues without blocking the user.
 */
export async function showInterstitialAfterPhoto(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    if (import.meta.env.DEV) return
    return
  }

  const ad = preloaded ?? new InterstitialAd({ adUnitId: interstitialUnitId() })
  preloaded = null

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      void Promise.all(handles.map((h) => h.remove())).finally(() => resolve())
    }

    const handles: { remove: () => Promise<void> }[] = []

    void (async () => {
      try {
        handles.push(
          await AdMob.addListener('interstitial.dismiss', () => {
            done()
          })
        )
        handles.push(
          await AdMob.addListener('interstitial.showfail', () => {
            done()
          })
        )
        handles.push(
          await AdMob.addListener('interstitial.loadfail', () => {
            done()
          })
        )

        if (!(await ad.isLoaded())) {
          await ad.load()
        }
        await ad.show()
      } catch {
        done()
      }
    })()
  })
}

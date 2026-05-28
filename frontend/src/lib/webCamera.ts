import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'

/** Native + browser: ensure OS/WebView camera permission before react-webcam mounts. */
export async function ensureCameraAccess(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const current = await Camera.checkPermissions()
    if (current.camera !== 'granted') {
      const requested = await Camera.requestPermissions({ permissions: ['camera'] })
      if (requested.camera !== 'granted') return false
    }
  }

  if (!navigator.mediaDevices?.getUserMedia) return false

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/** True when the <video> element is actually receiving frames (not just permission granted). */
export function waitForLiveVideo(video: HTMLVideoElement, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      video.removeEventListener('loadeddata', onEvent)
      video.removeEventListener('loadedmetadata', onEvent)
      video.removeEventListener('playing', onEvent)
      resolve(ok)
    }

    const isLive = () =>
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0

    const onEvent = () => {
      if (isLive()) finish(true)
    }

    video.addEventListener('loadeddata', onEvent)
    video.addEventListener('loadedmetadata', onEvent)
    video.addEventListener('playing', onEvent)
    if (isLive()) {
      finish(true)
      return
    }

    const timer = setTimeout(() => finish(isLive()), timeoutMs)
  })
}

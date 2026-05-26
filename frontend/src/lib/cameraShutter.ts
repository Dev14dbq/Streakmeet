import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

/** Classic camera shutter click — Web Audio, works after a user gesture. */
export function playCameraShutterSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    const duration = 0.09
    const sampleCount = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < sampleCount; i++) {
      const decay = Math.exp(-i / (ctx.sampleRate * 0.012))
      data[i] = (Math.random() * 2 - 1) * decay
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2200
    filter.Q.value = 0.8

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.85, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + duration + 0.02)

    const click = ctx.createOscillator()
    click.type = 'triangle'
    click.frequency.setValueAtTime(900, now)
    click.frequency.exponentialRampToValueAtTime(120, now + 0.035)

    const clickGain = ctx.createGain()
    clickGain.gain.setValueAtTime(0.2, now)
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

    click.connect(clickGain)
    clickGain.connect(ctx.destination)
    click.start(now)
    click.stop(now + 0.05)
  } catch {
    /* ignore — silent devices / autoplay restrictions */
  }
}

export function vibrateCameraShutter(): void {
  if (Capacitor.isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Medium })
    return
  }
  navigator.vibrate?.(12)
}

export function triggerCameraShutterFeedback(): void {
  playCameraShutterSound()
  vibrateCameraShutter()
}

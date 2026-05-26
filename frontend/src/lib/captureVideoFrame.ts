export interface CaptureVideoFrameOptions {
  minWidth?: number
  quality?: number
  mirror?: boolean
  /** Light polish for meet photos — pass true for camera captures */
  enhance?: boolean
}

const SUBTLE_ENHANCE_FILTER = 'contrast(1.05) saturate(1.07) brightness(1.02)'

/** Снимок с video в полном (или увеличенном) разрешении потока, не CSS-размере превью. */
export function captureVideoFrame(
  video: HTMLVideoElement,
  opts?: CaptureVideoFrameOptions
): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const minWidth = opts?.minWidth ?? 640
  let cw = vw
  let ch = vh
  if (cw < minWidth) {
    const scale = minWidth / cw
    cw = minWidth
    ch = Math.round(vh * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (opts?.mirror) {
    ctx.translate(cw, 0)
    ctx.scale(-1, 1)
  }

  const enhance = opts?.enhance === true
  if (enhance) {
    ctx.filter = SUBTLE_ENHANCE_FILTER
  }

  ctx.drawImage(video, 0, 0, cw, ch)
  ctx.filter = 'none'

  return canvas.toDataURL('image/jpeg', opts?.quality ?? 0.92)
}

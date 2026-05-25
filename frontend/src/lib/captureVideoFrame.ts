/** Снимок с video в полном (или увеличенном) разрешении потока, не CSS-размере превью. */
export function captureVideoFrame(
  video: HTMLVideoElement,
  opts?: { minWidth?: number; quality?: number; mirror?: boolean }
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
  ctx.drawImage(video, 0, 0, cw, ch)
  return canvas.toDataURL('image/jpeg', opts?.quality ?? 0.92)
}

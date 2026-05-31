/** Max edge (px) and JPEG quality for API uploads — keeps payloads under gateway limits. */
const DEFAULT_MAX_EDGE = 1600
const DEFAULT_QUALITY = 0.85

/** Center square crop (profile avatar), then downscale. */
export function prepareSquareAvatarForUpload(
  dataUrl: string,
  opts?: { maxEdge?: number; quality?: number }
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return Promise.resolve(dataUrl)
  }

  const maxEdge = opts?.maxEdge ?? 512
  const quality = opts?.quality ?? 0.8

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const sw = img.naturalWidth
      const sh = img.naturalHeight
      if (!sw || !sh) {
        reject(new Error('invalid_image_dimensions'))
        return
      }

      const side = Math.min(sw, sh)
      const sx = Math.floor((sw - side) / 2)
      const sy = Math.floor((sh - side) / 2)
      const out = side > maxEdge ? maxEdge : side

      const canvas = document.createElement('canvas')
      canvas.width = out
      canvas.height = out
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas_unavailable'))
        return
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

/**
 * Downscale and re-encode as JPEG so base64 payloads fit server limits (avatar, meet, etc.).
 */
export function prepareImageDataUrlForUpload(
  dataUrl: string,
  opts?: { maxEdge?: number; quality?: number }
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return Promise.resolve(dataUrl)
  }

  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts?.quality ?? DEFAULT_QUALITY

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (!w || !h) {
        reject(new Error('invalid_image_dimensions'))
        return
      }
      const longest = Math.max(w, h)
      if (longest > maxEdge) {
        const scale = maxEdge / longest
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas_unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

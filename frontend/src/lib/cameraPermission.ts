/** True when getUserMedia / Webcam failed due to missing camera permission. */
export function isCameraPermissionDenied(err: string | DOMException): boolean {
  if (typeof err === 'string') {
    return /denied|permission|allowed/i.test(err)
  }
  const name = err.name
  const msg = err.message ?? ''
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    /denied|permission|allowed/i.test(msg)
  )
}

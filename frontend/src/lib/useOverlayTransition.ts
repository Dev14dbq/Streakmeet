import { useEffect, useState } from 'react'

export type OverlayVariant = 'fade' | 'slideUp'

const DEFAULT_MS = 320

/**
 * Keeps overlay mounted while exit animation plays.
 * Returns class names toggled between --open and --closed (see index.css).
 */
export function useOverlayTransition(
  visible: boolean,
  variant: OverlayVariant = 'fade',
  durationMs = DEFAULT_MS
) {
  const [mounted, setMounted] = useState(visible)
  const [active, setActive] = useState(visible)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setActive(true))
      })
      return () => cancelAnimationFrame(raf)
    }

    setActive(false)
    const timer = window.setTimeout(() => setMounted(false), durationMs)
    return () => clearTimeout(timer)
  }, [visible, durationMs])

  const state = active ? 'open' : 'closed'

  return {
    mounted,
    active,
    screenClass: `overlay-screen overlay-screen--${variant} overlay-screen--${state}`,
    panelClass: `overlay-panel overlay-panel--pop overlay-panel--${state}`,
  }
}

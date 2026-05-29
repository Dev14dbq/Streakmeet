import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { ensureCameraAccess } from './webCamera'
import { isCameraPermissionDenied } from './cameraPermission'

export type CameraAccess = 'idle' | 'pending' | 'granted' | 'denied'

export interface UseCameraGateOptions {
  /** When false, permission state resets to idle. */
  active?: boolean
  /** Re-check permission when app returns from background (e.g. system Settings). */
  resumeRetry?: boolean
  /** Extra condition for resume retry (e.g. stream not live yet). */
  resumeRetryIf?: () => boolean
  onDenied?: () => void
  onGranted?: () => void
}

export function useCameraGate(options: UseCameraGateOptions = {}) {
  const { active = true, resumeRetry = true, resumeRetryIf, onDenied, onGranted } = options

  const [cameraAccess, setCameraAccess] = useState<CameraAccess>('idle')
  const [webcamMountKey, setWebcamMountKey] = useState(0)

  const onDeniedRef = useRef(onDenied)
  const onGrantedRef = useRef(onGranted)
  const resumeRetryIfRef = useRef(resumeRetryIf)
  onDeniedRef.current = onDenied
  onGrantedRef.current = onGranted
  resumeRetryIfRef.current = resumeRetryIf

  const reset = useCallback(() => {
    setCameraAccess('idle')
  }, [])

  const requestAccess = useCallback(async (): Promise<boolean> => {
    setCameraAccess('pending')
    const ok = await ensureCameraAccess()
    if (ok) {
      setCameraAccess('granted')
      setWebcamMountKey((k) => k + 1)
      onGrantedRef.current?.()
    } else {
      setCameraAccess('denied')
      onDeniedRef.current?.()
    }
    return ok
  }, [])

  const handleStreamError = useCallback(
    (err: string | DOMException, onOtherError?: (message: string) => void): boolean => {
      const msg = typeof err === 'string' ? err : err.message
      if (isCameraPermissionDenied(err)) {
        setCameraAccess('denied')
        onDeniedRef.current?.()
        return true
      }
      onOtherError?.(msg)
      return false
    },
    []
  )

  useEffect(() => {
    if (!active) {
      reset()
      return
    }

    setCameraAccess('pending')
    let cancelled = false
    void (async () => {
      const ok = await ensureCameraAccess()
      if (cancelled) return
      if (ok) {
        setCameraAccess('granted')
        setWebcamMountKey((k) => k + 1)
        onGrantedRef.current?.()
      } else {
        setCameraAccess('denied')
        onDeniedRef.current?.()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, reset])

  useEffect(() => {
    if (!resumeRetry || !Capacitor.isNativePlatform() || !active) return

    let remove: (() => void) | undefined
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      const shouldRetry = resumeRetryIfRef.current
        ? resumeRetryIfRef.current()
        : cameraAccess !== 'granted'
      if (shouldRetry) void requestAccess()
    }).then((h) => {
      remove = () => h.remove()
    })

    return () => remove?.()
  }, [active, resumeRetry, cameraAccess, requestAccess])

  const bumpMountKey = useCallback(() => {
    setWebcamMountKey((k) => k + 1)
  }, [])

  return {
    cameraAccess,
    webcamMountKey,
    isGranted: cameraAccess === 'granted',
    showGate: active && cameraAccess !== 'granted',
    requestAccess,
    handleStreamError,
    bumpMountKey,
    reset,
  }
}

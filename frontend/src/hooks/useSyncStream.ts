import { useEffect, useRef, type MutableRefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '../lib/api'
import type { BootstrapPhase } from '../context/AuthContext'
import { applySyncEvent } from '../lib/applySyncEvent'
import { isSyncStreamEnabled } from '../lib/connect/client'
import { runSyncStream, type SyncEnvelope } from '../lib/connect/syncStream'
import { useSyncModeReady } from './useSyncModeReady'
import {
  showInstantPushNotification,
  type AppNotificationPayload,
} from '../lib/instantNotifications'
import { translateNotification } from '../lib/translateNotification'
import { notify, toastLink } from '../lib/toast'

/**
 * Connect server-stream sync (replaces socket.io for cache patches when Rust stack is up).
 */
export function useSyncStream(
  user: AuthUser | null,
  bootstrapPhase: BootstrapPhase,
  appActiveRef: MutableRefObject<boolean>
) {
  const navigate = useNavigate()
  const syncReady = useSyncModeReady()
  const enabled =
    syncReady && user !== null && bootstrapPhase !== 'loading' && isSyncStreamEnabled()
  const handlerRef = useRef<(env: SyncEnvelope) => void>(() => {})

  useEffect(() => {
    handlerRef.current = (env) => {
      if (env.payload.case === 'notification') {
        const n = env.payload.value
        const message = translateNotification({ type: n.type, params: n.params, message: '' })
        const detail: AppNotificationPayload = { ...n, message }
        window.dispatchEvent(new CustomEvent('app-notification', { detail }))
        if (!appActiveRef.current) {
          void showInstantPushNotification(detail)
        } else if (detail.route) {
          toastLink(message, detail.route, navigate)
        } else {
          notify(message)
        }
      }
      applySyncEvent(env)
    }
  }, [navigate, appActiveRef])

  useEffect(() => {
    if (!enabled) return

    const abort = new AbortController()
    void runSyncStream(
      {
        onEnvelope: (env) => handlerRef.current(env),
        onError: (err) => console.warn('[sync] stream error', err),
        onOpen: () => console.info('[sync] stream connected'),
      },
      abort.signal
    )

    return () => abort.abort()
  }, [enabled, user?.id])
}

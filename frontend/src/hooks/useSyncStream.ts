import { useEffect, useRef } from 'react'
import type { AuthUser } from '../lib/api'
import type { BootstrapPhase } from '../context/AuthContext'
import { applySyncEvent } from '../lib/applySyncEvent'
import { isSyncStreamEnabled } from '../lib/connect/client'
import { runSyncStream, type SyncEnvelope } from '../lib/connect/syncStream'

/**
 * Connect server-stream sync (replaces socket.io gradually).
 * Enabled when VITE_USE_SYNC_STREAM=true — patches SWR caches from sync events.
 */
export function useSyncStream(user: AuthUser | null, bootstrapPhase: BootstrapPhase) {
  const enabled = user !== null && bootstrapPhase !== 'loading' && isSyncStreamEnabled()
  const handlerRef = useRef<(env: SyncEnvelope) => void>(() => {})

  useEffect(() => {
    handlerRef.current = (env) => {
      if (env.payload.case === 'heartbeat') {
        console.debug('[sync] heartbeat', env.payload.message, env.eventId)
        return
      }
      if (env.payload.case === 'friendEvent') {
        console.debug('[sync] friendEvent', env.payload.value.eventType, env.eventId)
        applySyncEvent(env)
        return
      }
      console.debug('[sync] envelope', env)
    }
  })

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

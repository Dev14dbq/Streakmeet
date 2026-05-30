import { useEffect, useRef } from 'react'
import type { AuthUser } from '../lib/api'
import type { BootstrapPhase } from '../context/AuthContext'
import { isSyncStreamEnabled } from '../lib/connect/client'
import { runSyncStream, type SyncEnvelope } from '../lib/connect/syncStream'

/**
 * Connect server-stream sync (replaces socket.io gradually).
 * Disabled by default — set VITE_USE_SYNC_STREAM=true to enable alongside legacy socket.
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
      console.debug('[sync] envelope', env)
      // Phase 1: applySyncEvent(env) — patch SWR caches
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

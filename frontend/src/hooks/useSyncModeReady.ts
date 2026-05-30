import { useEffect, useState } from 'react'
import { isSyncModeResolved, onSyncModeReady } from '../lib/connect/client'

/** Re-render when async Rust probe finishes (auto mode). */
export function useSyncModeReady(): boolean {
  const [ready, setReady] = useState(isSyncModeResolved())

  useEffect(() => onSyncModeReady(() => setReady(true)), [])

  return ready
}

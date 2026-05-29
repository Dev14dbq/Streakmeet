import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getRealtimeServerUrl } from '../lib/api'
import { getAccessToken } from '../context/AuthContext'

let sharedSocket: Socket | null = null
let refCount = 0

function getOrCreateSocket(token: string): Socket {
  if (!sharedSocket || !sharedSocket.connected) {
    sharedSocket?.disconnect()
    sharedSocket = io(getRealtimeServerUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })
  }
  return sharedSocket
}

export function useSocket(
  enabled: boolean,
  onEvent: (socket: Socket) => (() => void) | void
) {
  useEffect(() => {
    if (!enabled) return
    const token = getAccessToken()
    if (!token) return

    refCount++
    const socket = getOrCreateSocket(token)
    const cleanup = onEvent(socket)

    return () => {
      cleanup?.()
      refCount--
      if (refCount === 0) {
        sharedSocket?.disconnect()
        sharedSocket = null
      }
    }
  }, [enabled, onEvent])
}

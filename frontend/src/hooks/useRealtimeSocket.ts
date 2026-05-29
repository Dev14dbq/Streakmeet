import { useCallback, useRef } from 'react'
import { type NavigateFunction } from 'react-router-dom'
import { type Socket } from 'socket.io-client'
import type { AuthUser } from '../lib/api'
import { type BootstrapPhase } from '../context/AuthContext'
import {
  showInstantPushNotification,
  type AppNotificationPayload,
} from '../lib/instantNotifications'
import { notify, toastLink } from '../lib/toast'
import { useSocket } from './useSocket'

export function useRealtimeSocket(
  user: AuthUser | null,
  bootstrapPhase: BootstrapPhase,
  navigate: NavigateFunction
) {
  const appActiveRef = useRef(true)

  const onEvent = useCallback(
    (socket: Socket) => {
      socket.on('notification', (data: AppNotificationPayload) => {
        window.dispatchEvent(new CustomEvent('app-notification', { detail: data }))
        if (!appActiveRef.current) {
          void showInstantPushNotification(data)
          return
        }
        if (data.route) {
          toastLink(data.message, data.route, navigate)
        } else {
          notify(data.message)
        }
      })
      return () => socket.off('notification')
    },
    [navigate]
  )

  useSocket(user !== null && bootstrapPhase === 'hidden', onEvent)

  return appActiveRef
}

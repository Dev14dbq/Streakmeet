import { useEffect, type MutableRefObject } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { AuthUser } from '../lib/api'
import { hasAuthSession } from '../lib/api/client'
import { promptEssentialPermissionsOnFirstLaunch } from '../lib/nativePermissions'
import { scheduleStreakNotifications } from '../lib/streakNotifications'
import { resumeLocationSharingIfNeeded } from '../lib/locationSharing'

export function useAppLifecycle(user: AuthUser | null, appActiveRef?: MutableRefObject<boolean>) {
  useEffect(() => {
    if (!user) return
    void promptEssentialPermissionsOnFirstLaunch().then(() => {
      if (user.faceEnrolled) void scheduleStreakNotifications()
    })
  }, [user?.id, user?.faceEnrolled])

  useEffect(() => {
    if (!user || !hasAuthSession()) return
    void resumeLocationSharingIfNeeded()
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let cleanup: (() => void) | undefined
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (appActiveRef) appActiveRef.current = isActive
      if (isActive) void scheduleStreakNotifications()
    }).then((handle) => {
      cleanup = () => handle.remove()
    })
    return () => cleanup?.()
  }, [user?.id])
}

import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { io, Socket } from 'socket.io-client'
import AppLayout from './components/AppLayout'
import AppToaster from './components/AppToaster'
import MobileOnlyGate from './components/MobileOnlyGate'
import { notify, toastLink } from './lib/toast'
import AuthPage from './pages/auth/AuthPage'
import EmailAuthPage from './pages/auth/EmailAuthPage'
import RegisterDetailsPage from './pages/auth/RegisterDetailsPage'
import FaceEnrollmentPage from './pages/auth/FaceEnrollmentPage'
import AccountDeletedPage from './pages/auth/AccountDeletedPage'
import HomePage from './pages/home/HomePage'
const MapPage = lazy(() => import('./pages/map/MapPage'))
import MemoriesPage from './pages/memories/MemoriesPage'
import ProfilePage from './pages/profile/ProfilePage'
import SettingsPage from './pages/settings/SettingsPage'
import type { AuthUser } from './lib/api'
import { syncDeviceTimezone } from './lib/api'
import { promptEssentialPermissionsOnFirstLaunch } from './lib/nativePermissions'
import {
  registerNotificationTapHandler,
  scheduleStreakNotifications,
} from './lib/streakNotifications'
import { resumeLocationSharingIfNeeded } from './lib/locationSharing'
import { pruneStaleImageCache } from './lib/remoteImageCache'
import { initGoogleAuth } from './lib/googleAuth'
import { App as CapApp } from '@capacitor/app'

import StreakDetailsPage from './pages/home/StreakDetailsPage'
import MagicMeetResultPage from './pages/meet/MagicMeetResultPage'
import PublicProfileRoute from './pages/profile/PublicProfileRoute'
import LegacyAddRedirect from './pages/profile/LegacyAddRedirect'
import NotFoundPage from './pages/NotFoundPage'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export default function App() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? (JSON.parse(stored) as AuthUser) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user))
    else localStorage.removeItem('user')
  }, [user])

  const timezoneSynced = useRef(false)
  useEffect(() => {
    if (!user || timezoneSynced.current) return
    timezoneSynced.current = true
    syncDeviceTimezone().catch(() => {})
  }, [user?.id])

  useEffect(() => {
    return registerNotificationTapHandler((route) => navigate(route))
  }, [navigate])

  useEffect(() => {
    void initGoogleAuth()
    void pruneStaleImageCache()
  }, [])

  useEffect(() => {
    if (!user) return
    void promptEssentialPermissionsOnFirstLaunch().then(() => {
      if (user.faceEnrolled) void scheduleStreakNotifications()
    })
  }, [user?.id, user?.faceEnrolled])

  useEffect(() => {
    if (!user) return
    void resumeLocationSharingIfNeeded()
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let cleanup: (() => void) | undefined
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void scheduleStreakNotifications()
    }).then((handle) => {
      cleanup = () => handle.remove()
    })
    return () => cleanup?.()
  }, [user?.id])

  // Socket.io connection
  useEffect(() => {
    let socket: Socket | null = null
    const token = localStorage.getItem('accessToken')

    if (user && token) {
      socket = io(window.location.origin, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      })

      socket.on('notification', (data: { message: string; route?: string }) => {
        if (data.route) {
          toastLink(data.message, data.route, navigate)
        } else {
          notify(data.message)
        }
      })
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [user])

  function handleAuth(authUser: AuthUser, token: string, fromSignup = false, returnTo?: string) {
    localStorage.setItem('accessToken', token)
    setUser(authUser)
    if (returnTo && authUser.faceEnrolled) {
      navigate(returnTo, { replace: true })
      return
    }
    if (authUser.faceEnrolled) {
      navigate('/', { replace: true })
    } else {
      navigate('/face-enrollment', {
        replace: true,
        state: fromSignup ? { autoStart: true } : undefined,
      })
    }
  }

  const isLoggedIn = !!user
  const needsFaceEnrollment = isLoggedIn && !user!.faceEnrolled

  function loggedInRedirect() {
    return needsFaceEnrollment ? (
      <Navigate to="/face-enrollment" replace />
    ) : (
      <Navigate to="/" replace />
    )
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <MobileOnlyGate>
        <AppToaster />
        <Routes>
          {/* ── Auth (без меню) ─────────────────────────────────────────── */}
          <Route
            path="/login"
            element={isLoggedIn ? loggedInRedirect() : <AuthPage onAuth={handleAuth} />}
          />
          <Route
            path="/login/email"
            element={isLoggedIn ? loggedInRedirect() : <EmailAuthPage onAuth={handleAuth} />}
          />
          <Route
            path="/register"
            element={isLoggedIn ? loggedInRedirect() : <RegisterDetailsPage onAuth={handleAuth} />}
          />
          <Route path="/account-deleted" element={<AccountDeletedPage onAuth={handleAuth} />} />
          <Route
            path="/face-enrollment"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : (
                <FaceEnrollmentPage onUserUpdate={setUser} />
              )
            }
          />

          {/* ── App (с нижним меню) ──────────────────────────────────────── */}
          <Route
            path="/"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <HomePage user={user} />
                </AppLayout>
              )
            }
          />
          <Route
            path="/streaks/:nickname"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <StreakDetailsPage />
                </AppLayout>
              )
            }
          />
          <Route
            path="/map"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <Suspense
                    fallback={
                      <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--color-on-surface-variant)]">
                        Загрузка карты…
                      </div>
                    }
                  >
                    <MapPage />
                  </Suspense>
                </AppLayout>
              )
            }
          />
          <Route
            path="/memories"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <MemoriesPage />
                </AppLayout>
              )
            }
          />
          <Route path="/friends" element={<Navigate to="/" replace />} />
          <Route
            path="/profile"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <ProfilePage user={user} />
                </AppLayout>
              )
            }
          />
          <Route
            path="/magic-meet/success"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <MagicMeetResultPage />
              )
            }
          />
          <Route
            path="/settings"
            element={
              !isLoggedIn ? (
                <Navigate to="/login" replace />
              ) : needsFaceEnrollment ? (
                <Navigate to="/face-enrollment" replace />
              ) : (
                <AppLayout>
                  <SettingsPage user={user} onUserUpdate={setUser} />
                </AppLayout>
              )
            }
          />

          <Route path="/add/:qrCodeId" element={<LegacyAddRedirect />} />
          <Route
            path="/404"
            element={
              <NotFoundPage
                homeTo={!isLoggedIn ? '/login' : needsFaceEnrollment ? '/face-enrollment' : '/'}
              />
            }
          />
          <Route path="/:nickname" element={<PublicProfileRoute currentUser={user} />} />

          <Route
            path="*"
            element={
              <NotFoundPage
                homeTo={!isLoggedIn ? '/login' : needsFaceEnrollment ? '/face-enrollment' : '/'}
              />
            }
          />
        </Routes>
      </MobileOnlyGate>
    </GoogleOAuthProvider>
  )
}

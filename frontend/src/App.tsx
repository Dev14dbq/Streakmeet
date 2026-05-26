import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { io, Socket } from 'socket.io-client'
import AppLayout from './components/AppLayout'
import AppToaster from './components/AppToaster'
import AppBootstrapScreen from './components/AppBootstrapScreen'
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
import TermsPage from './pages/legal/TermsPage'
import PrivacyPage from './pages/legal/PrivacyPage'
import type { AuthUser, LegalConsentStatus } from './lib/api'
import { getLegalConsentStatus, getRealtimeServerUrl, setUnauthorizedHandler } from './lib/api'
import { bootstrapSession } from './lib/bootstrapApp'
import { promptEssentialPermissionsOnFirstLaunch } from './lib/nativePermissions'
import {
  registerNotificationTapHandler,
  scheduleStreakNotifications,
} from './lib/streakNotifications'
import {
  showInstantPushNotification,
  type AppNotificationPayload,
} from './lib/instantNotifications'
import { resumeLocationSharingIfNeeded } from './lib/locationSharing'
import { App as CapApp } from '@capacitor/app'

import StreakDetailsPage from './pages/home/StreakDetailsPage'
import MagicMeetResultPage from './pages/meet/MagicMeetResultPage'
import PublicProfileRoute from './pages/profile/PublicProfileRoute'
import LegacyAddRedirect from './pages/profile/LegacyAddRedirect'
import NotFoundPage from './pages/NotFoundPage'
import LegalConsentModal from './components/LegalConsentModal'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

interface PendingNavigation {
  fromSignup?: boolean
  returnTo?: string
  faceEnrolled: boolean
}

type BootstrapPhase = 'hidden' | 'loading' | 'leaving'

function initialBootstrapPhase(): BootstrapPhase {
  return localStorage.getItem('accessToken') ? 'loading' : 'hidden'
}

export default function App() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const pendingNavRef = useRef<PendingNavigation | null>(null)
  const [bootstrapVersion, setBootstrapVersion] = useState(0)
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>(initialBootstrapPhase)
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? (JSON.parse(stored) as AuthUser) : null
    } catch {
      return null
    }
  })
  const [legalStatus, setLegalStatus] = useState<LegalConsentStatus | null>(null)
  const [legalChecked, setLegalChecked] = useState(false)
  const [legalFetchFailed, setLegalFetchFailed] = useState(false)

  function applyPendingNavigation(pending: PendingNavigation, authUser: AuthUser) {
    if (pending.returnTo && authUser.faceEnrolled) {
      navigate(pending.returnTo, { replace: true })
      return
    }
    if (authUser.faceEnrolled) {
      navigate('/', { replace: true })
    } else {
      navigate('/face-enrollment', {
        replace: true,
        state: pending.fromSignup ? { autoStart: true } : undefined,
      })
    }
  }

  useEffect(() => {
    let cancelled = false
    const hasToken = !!localStorage.getItem('accessToken')

    if (!hasToken) {
      setBootstrapPhase('hidden')
      setUser(null)
      setLegalStatus(null)
      setLegalChecked(true)
      setLegalFetchFailed(false)
      return
    }

    setBootstrapPhase('loading')

    void bootstrapSession().then((result) => {
      if (cancelled) return

      if (result.deletedAccount) {
        setUser(null)
        setLegalStatus(null)
        setLegalChecked(true)
        setLegalFetchFailed(false)
        setBootstrapPhase('hidden')
        navigateRef.current('/account-deleted', {
          replace: true,
          state: result.deletedAccount,
        })
        return
      }

      setUser(result.user)
      setLegalStatus(result.legalStatus)
      setLegalChecked(result.legalChecked)
      setLegalFetchFailed(result.legalFetchFailed)
      setBootstrapPhase('leaving')

      const pending = pendingNavRef.current
      if (pending && result.user) {
        pendingNavRef.current = null
        applyPendingNavigation(pending, result.user)
      }
    })

    return () => {
      cancelled = true
    }
  }, [bootstrapVersion])

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user))
    else localStorage.removeItem('user')
  }, [user])

  const appActiveRef = useRef(true)

  useEffect(() => {
    return registerNotificationTapHandler((route) => navigate(route))
  }, [navigate])

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
    setUnauthorizedHandler(() => {
      setUser(null)
      setLegalStatus(null)
      setLegalChecked(false)
      setBootstrapPhase('hidden')
      navigate('/login', { replace: true })
    })
    return () => setUnauthorizedHandler(() => {})
  }, [navigate])

  useEffect(() => {
    if (!user) return
    let cleanup: (() => void) | undefined
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      appActiveRef.current = isActive
      if (isActive) void scheduleStreakNotifications()
    }).then((handle) => {
      cleanup = () => handle.remove()
    })
    return () => cleanup?.()
  }, [user?.id])

  useEffect(() => {
    let socket: Socket | null = null
    const token = localStorage.getItem('accessToken')

    if (user && token && bootstrapPhase === 'hidden') {
      socket = io(getRealtimeServerUrl(), {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      })

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
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [user?.id, bootstrapPhase, navigate])

  function handleAuth(authUser: AuthUser, token: string, fromSignup = false, returnTo?: string) {
    localStorage.setItem('accessToken', token)
    localStorage.setItem('user', JSON.stringify(authUser))
    pendingNavRef.current = {
      fromSignup,
      returnTo,
      faceEnrolled: authUser.faceEnrolled,
    }
    setBootstrapVersion((v) => v + 1)
  }

  const isLoggedIn = !!user
  const showApp = bootstrapPhase === 'hidden' || bootstrapPhase === 'leaving'
  const needsFaceEnrollment = isLoggedIn && !user!.faceEnrolled
  const needsLegalConsent =
    isLoggedIn &&
    legalChecked &&
    legalStatus?.needsAcceptance &&
    location.pathname !== '/terms' &&
    location.pathname !== '/privacy'

  function loggedInRedirect() {
    return needsFaceEnrollment ? (
      <Navigate to="/face-enrollment" replace />
    ) : (
      <Navigate to="/" replace />
    )
  }

  if (!showApp) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <MobileOnlyGate>
          <AppBootstrapScreen />
        </MobileOnlyGate>
      </GoogleOAuthProvider>
    )
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <MobileOnlyGate>
        {bootstrapPhase === 'leaving' && (
          <AppBootstrapScreen leaving onLeaveComplete={() => setBootstrapPhase('hidden')} />
        )}
        <AppToaster />
        {legalFetchFailed && (
          <div className="fixed top-0 inset-x-0 z-[199] bg-[var(--color-error-container)] px-4 py-3 text-center text-sm text-[var(--color-on-error-container)]">
            {t('app.legalCheckFailed')}{' '}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => {
                setLegalFetchFailed(false)
                setLegalChecked(false)
                getLegalConsentStatus()
                  .then(({ data }) => {
                    setLegalStatus(data)
                    setLegalFetchFailed(false)
                  })
                  .catch(() => setLegalFetchFailed(true))
                  .finally(() => setLegalChecked(true))
              }}
            >
              {t('app.retry')}
            </button>
          </div>
        )}
        {needsLegalConsent && legalStatus && (
          <LegalConsentModal
            status={legalStatus}
            onAccepted={() =>
              setLegalStatus({
                ...legalStatus,
                needsAcceptance: false,
                terms: { ...legalStatus.terms, accepted: true },
                privacy: { ...legalStatus.privacy, accepted: true },
              })
            }
          />
        )}
        <Routes>
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
                        {t('app.loadingMap')}
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
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

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

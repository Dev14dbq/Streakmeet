import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import AppToaster from './components/AppToaster'
import AppBootstrapScreen from './components/AppBootstrapScreen'
import MobileOnlyGate from './components/MobileOnlyGate'
import AuthPage from './pages/auth/AuthPage'
import EmailAuthPage from './pages/auth/EmailAuthPage'
import RegisterDetailsPage from './pages/auth/RegisterDetailsPage'
import FaceEnrollmentPage from './pages/auth/FaceEnrollmentPage'
import AccountDeletedPage from './pages/auth/AccountDeletedPage'
import VerifyEmailRoute from './pages/auth/VerifyEmailRoute'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import HomePage from './pages/home/HomePage'
import MapPage from './pages/map/MapPage'
import MemoriesPage from './pages/memories/MemoriesPage'
import ProfilePage from './pages/profile/ProfilePage'
import SettingsPage from './pages/settings/SettingsPage'
import AppearanceSettingsPage from './pages/settings/AppearanceSettingsPage'
import LanguageSettingsPage from './pages/settings/LanguageSettingsPage'
import NotificationSettingsPage from './pages/settings/NotificationSettingsPage'
import PrivacySettingsPage from './pages/settings/PrivacySettingsPage'
import ChangeEmailPage from './pages/settings/ChangeEmailPage'
import ChangePasswordPage from './pages/settings/ChangePasswordPage'
import TermsPage from './pages/legal/TermsPage'
import PrivacyPage from './pages/legal/PrivacyPage'
import { registerNotificationTapHandler } from './lib/streakNotifications'
import { useAuth, getAuthenticatedHomePath } from './context/AuthContext'
import ProtectedLayout, {
  AuthOnlyRoute,
  LoggedInRedirect,
  ProtectedRoute,
} from './routes/ProtectedLayout'
import { useLegalConsent } from './hooks/useLegalConsent'
import { useRealtimeSocket } from './hooks/useRealtimeSocket'
import { useAppLifecycle } from './hooks/useAppLifecycle'

import StreakDetailsPage from './pages/home/StreakDetailsPage'
import MagicMeetResultPage from './pages/meet/MagicMeetResultPage'
import PublicProfileRoute from './pages/profile/PublicProfileRoute'
import LegacyAddRedirect from './pages/profile/LegacyAddRedirect'
import NotFoundPage from './pages/NotFoundPage'
import LegalConsentModal from './components/LegalConsentModal'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export default function App() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    user,
    setUser,
    isLoggedIn,
    needsEmailVerification,
    needsFaceEnrollment,
    bootstrapPhase,
    showApp,
    handleAuth,
    handleLogout,
  } = useAuth()

  const {
    legalStatus,
    legalFetchFailed,
    needsLegalConsent,
    retryLegalCheck,
    onLegalAccepted,
  } = useLegalConsent(user, isLoggedIn)

  const appActiveRef = useRealtimeSocket(user, bootstrapPhase, navigate)
  useAppLifecycle(user, appActiveRef)

  useEffect(() => {
    return registerNotificationTapHandler((route) => navigate(route))
  }, [navigate])

  const notFoundHome = getAuthenticatedHomePath(
    isLoggedIn,
    needsEmailVerification,
    needsFaceEnrollment
  )

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
        <AppToaster />
        {legalFetchFailed && (
          <div className="fixed top-0 inset-x-0 z-[199] bg-[var(--color-error-container)] px-4 py-3 text-center text-sm text-[var(--color-on-error-container)]">
            {t('app.legalCheckFailed')}{' '}
            <button
              type="button"
              className="underline font-semibold"
              onClick={retryLegalCheck}
            >
              {t('app.retry')}
            </button>
          </div>
        )}
        {needsLegalConsent && legalStatus && (
          <LegalConsentModal status={legalStatus} onAccepted={onLegalAccepted} />
        )}
        <Routes>
          <Route
            path="/login"
            element={isLoggedIn ? <LoggedInRedirect /> : <AuthPage onAuth={handleAuth} />}
          />
          <Route
            path="/login/email"
            element={isLoggedIn ? <LoggedInRedirect /> : <EmailAuthPage onAuth={handleAuth} />}
          />
          <Route
            path="/register"
            element={
              isLoggedIn ? <LoggedInRedirect /> : <RegisterDetailsPage onAuth={handleAuth} />
            }
          />
          <Route path="/account-deleted" element={<AccountDeletedPage onAuth={handleAuth} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/verify-email"
            element={
              <VerifyEmailRoute
                user={user}
                isLoggedIn={isLoggedIn}
                onLogout={handleLogout}
                onUserUpdate={setUser}
              />
            }
          />
          <Route element={<AuthOnlyRoute />}>
            <Route path="/face-enrollment" element={<FaceEnrollmentPage />} />
          </Route>

          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<HomePage user={user!} />} />
            <Route path="/streaks/:nickname" element={<StreakDetailsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route path="/profile" element={<ProfilePage user={user!} />} />
            <Route path="/settings" element={<SettingsPage user={user!} onUserUpdate={setUser} />} />
            <Route path="/settings/appearance" element={<AppearanceSettingsPage />} />
            <Route path="/settings/language" element={<LanguageSettingsPage />} />
            <Route
              path="/settings/notifications"
              element={<NotificationSettingsPage user={user!} onUserUpdate={setUser} />}
            />
            <Route
              path="/settings/privacy"
              element={<PrivacySettingsPage user={user!} onUserUpdate={setUser} />}
            />
            <Route
              path="/settings/email"
              element={<ChangeEmailPage user={user!} onUserUpdate={setUser} />}
            />
            <Route path="/settings/password" element={<ChangePasswordPage />} />
          </Route>

          <Route path="/friends" element={<Navigate to="/" replace />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/magic-meet/success" element={<MagicMeetResultPage />} />
          </Route>

          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/add/:qrCodeId" element={<LegacyAddRedirect />} />
          <Route path="/404" element={<NotFoundPage homeTo={notFoundHome} />} />
          <Route path="/:nickname" element={<PublicProfileRoute currentUser={user} />} />
          <Route path="*" element={<NotFoundPage homeTo={notFoundHome} />} />
        </Routes>
      </MobileOnlyGate>
    </GoogleOAuthProvider>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '../lib/api'
import { setUnauthorizedHandler } from '../lib/api'
import {
  clearSession,
  getStoredUser,
  hasAuthSession,
  setSession,
  setStoredUser,
} from '../lib/authStorage'
import { initSyncMode } from '../lib/connect/client'
import { bootstrapSession } from '../lib/bootstrapApp'
import { clearFaceEnrollmentDefer, isFaceEnrollmentDeferred } from '../lib/faceEnrollmentDefer'
import { stopLocationSharing } from '../lib/locationSharing'
import { safeInternalPath } from '../lib/safeNavigate'
import { clearStreakWidget } from '../lib/widgetSync'

export type BootstrapPhase = 'hidden' | 'loading' | 'leaving'

export { getAccessToken, getStoredUser } from '../lib/authStorage'

interface PendingNavigation {
  fromSignup?: boolean
  returnTo?: string
  faceEnrolled: boolean
}

function initialBootstrapPhase(): BootstrapPhase {
  if (!hasAuthSession()) return 'hidden'
  return getStoredUser() ? 'hidden' : 'loading'
}

export function getAuthenticatedHomePath(
  isLoggedIn: boolean,
  needsEmailVerification: boolean,
  needsFaceEnrollment: boolean
): string {
  if (!isLoggedIn) return '/login'
  if (needsEmailVerification) return '/verify-email'
  if (needsFaceEnrollment && !isFaceEnrollmentDeferred()) return '/face-enrollment'
  return '/'
}

interface AuthContextValue {
  user: AuthUser | null
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>
  isLoggedIn: boolean
  needsEmailVerification: boolean
  needsFaceEnrollment: boolean
  bootstrapPhase: BootstrapPhase
  setBootstrapPhase: React.Dispatch<React.SetStateAction<BootstrapPhase>>
  showApp: boolean
  handleAuth: (authUser: AuthUser, token: string, fromSignup?: boolean, returnTo?: string) => void
  handleLogout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const pendingNavRef = useRef<PendingNavigation | null>(null)
  const logoutInFlightRef = useRef(false)
  const [bootstrapVersion, setBootstrapVersion] = useState(0)
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>(initialBootstrapPhase)
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)

  const applyPendingNavigation = useCallback(
    (pending: PendingNavigation, authUser: AuthUser) => {
      if (!authUser.emailVerified) {
        navigate('/verify-email', { replace: true })
        return
      }
      const safeReturn = safeInternalPath(pending.returnTo)
      if (safeReturn && authUser.faceEnrolled) {
        navigate(safeReturn, { replace: true })
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
    },
    [navigate]
  )

  const handleLogout = useCallback(async () => {
    if (logoutInFlightRef.current) return
    logoutInFlightRef.current = true
    try {
      await stopLocationSharing().catch(() => {})
      await clearStreakWidget().catch(() => {})
      clearFaceEnrollmentDefer()
      clearSession()
      setUser(null)
      setBootstrapPhase('hidden')
      navigate('/login', { replace: true })
    } finally {
      logoutInFlightRef.current = false
    }
  }, [navigate])

  const handleAuth = useCallback(
    (authUser: AuthUser, token: string, fromSignup = false, returnTo?: string) => {
      setSession(token, authUser)
      setUser(authUser)
      pendingNavRef.current = {
        fromSignup,
        returnTo: safeInternalPath(returnTo) ?? undefined,
        faceEnrolled: authUser.faceEnrolled,
      }
      setBootstrapVersion((v) => v + 1)
    },
    []
  )

  useEffect(() => {
    void initSyncMode()
  }, [])

  useEffect(() => {
    let cancelled = false
    const hasToken = hasAuthSession()

    if (!hasToken) {
      setBootstrapPhase('hidden')
      setUser(null)
      return
    }

    const needsSplash = pendingNavRef.current !== null || !getStoredUser()
    if (needsSplash) {
      setBootstrapPhase('loading')
    }

    void initSyncMode()
      .then(() => bootstrapSession())
      .then((result) => {
        if (cancelled) return

        if (result.deletedAccount) {
          setUser(null)
          setBootstrapPhase('hidden')
          navigateRef.current('/account-deleted', {
            replace: true,
            state: result.deletedAccount,
          })
          return
        }

        setUser(result.user)
        setBootstrapPhase('hidden')

        const pending = pendingNavRef.current
        if (pending && result.user) {
          pendingNavRef.current = null
          applyPendingNavigation(pending, result.user)
        }
      })
      .catch(() => {
        if (!cancelled) setBootstrapPhase('hidden')
      })

    return () => {
      cancelled = true
    }
  }, [bootstrapVersion, applyPendingNavigation])

  useEffect(() => {
    if (user) setStoredUser(user)
    else if (!hasAuthSession()) clearSession()
  }, [user])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void handleLogout()
    })
    return () => setUnauthorizedHandler(() => {})
  }, [handleLogout])

  const isLoggedIn = !!user
  const needsEmailVerification = isLoggedIn && user!.emailVerified === false
  const needsFaceEnrollment =
    isLoggedIn &&
    user!.emailVerified !== false &&
    !user!.faceEnrolled &&
    !isFaceEnrollmentDeferred()
  const showApp = bootstrapPhase !== 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser,
      isLoggedIn,
      needsEmailVerification,
      needsFaceEnrollment,
      bootstrapPhase,
      setBootstrapPhase,
      showApp,
      handleAuth,
      handleLogout,
    }),
    [
      user,
      isLoggedIn,
      needsEmailVerification,
      needsFaceEnrollment,
      bootstrapPhase,
      showApp,
      handleAuth,
      handleLogout,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

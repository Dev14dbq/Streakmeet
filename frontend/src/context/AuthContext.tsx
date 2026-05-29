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
import { bootstrapSession } from '../lib/bootstrapApp'
import { stopLocationSharing } from '../lib/locationSharing'

export type BootstrapPhase = 'hidden' | 'loading' | 'leaving'

interface PendingNavigation {
  fromSignup?: boolean
  returnTo?: string
  faceEnrolled: boolean
}

function initialBootstrapPhase(): BootstrapPhase {
  return localStorage.getItem('accessToken') ? 'loading' : 'hidden'
}

export function getStoredUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem('user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  } catch {
    return null
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken')
}

export function getAuthenticatedHomePath(
  isLoggedIn: boolean,
  needsEmailVerification: boolean,
  needsFaceEnrollment: boolean
): string {
  if (!isLoggedIn) return '/login'
  if (needsEmailVerification) return '/verify-email'
  if (needsFaceEnrollment) return '/face-enrollment'
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
  const [bootstrapVersion, setBootstrapVersion] = useState(0)
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>(initialBootstrapPhase)
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)

  const applyPendingNavigation = useCallback((pending: PendingNavigation, authUser: AuthUser) => {
    if (!authUser.emailVerified) {
      navigate('/verify-email', { replace: true })
      return
    }
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
  }, [navigate])

  const handleLogout = useCallback(async () => {
    await stopLocationSharing().catch(() => {})
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    setUser(null)
    setBootstrapPhase('hidden')
    navigate('/login', { replace: true })
  }, [navigate])

  const handleAuth = useCallback(
    (authUser: AuthUser, token: string, fromSignup = false, returnTo?: string) => {
      localStorage.setItem('accessToken', token)
      localStorage.setItem('user', JSON.stringify(authUser))
      setUser(authUser)
      pendingNavRef.current = {
        fromSignup,
        returnTo,
        faceEnrolled: authUser.faceEnrolled,
      }
      setBootstrapVersion((v) => v + 1)
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    const hasToken = !!localStorage.getItem('accessToken')

    if (!hasToken) {
      setBootstrapPhase('hidden')
      setUser(null)
      return
    }

    setBootstrapPhase('loading')

    void bootstrapSession().then((result) => {
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
      setBootstrapPhase(result.usedCachedSession ? 'hidden' : 'leaving')

      const pending = pendingNavRef.current
      if (pending && result.user) {
        pendingNavRef.current = null
        applyPendingNavigation(pending, result.user)
      }
    })

    return () => {
      cancelled = true
    }
  }, [bootstrapVersion, applyPendingNavigation])

  useEffect(() => {
    if (user) localStorage.setItem('user', JSON.stringify(user))
    else localStorage.removeItem('user')
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
    isLoggedIn && user!.emailVerified !== false && !user!.faceEnrolled
  const showApp = bootstrapPhase === 'hidden' || bootstrapPhase === 'leaving'

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

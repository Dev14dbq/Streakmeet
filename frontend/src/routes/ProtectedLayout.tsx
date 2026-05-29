import { Navigate, Outlet } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { useAuth } from '../context/AuthContext'

function useSessionRedirect() {
  const { isLoggedIn, needsEmailVerification, needsFaceEnrollment } = useAuth()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (needsEmailVerification) return <Navigate to="/verify-email" replace />
  if (needsFaceEnrollment) return <Navigate to="/face-enrollment" replace />
  return null
}

/** Logged-in guard without face-enrollment redirect (verify-email, face-enrollment flows). */
export function AuthOnlyRoute() {
  const { isLoggedIn, needsEmailVerification } = useAuth()

  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (needsEmailVerification) return <Navigate to="/verify-email" replace />
  return <Outlet />
}

/** Full session guard for routes without AppLayout. */
export function ProtectedRoute() {
  const redirect = useSessionRedirect()
  if (redirect) return redirect
  return <Outlet />
}

export default function ProtectedLayout() {
  const redirect = useSessionRedirect()
  if (redirect) return redirect
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

/** Redirect authenticated users away from guest-only auth pages. */
export function LoggedInRedirect() {
  const { needsEmailVerification, needsFaceEnrollment } = useAuth()

  if (needsEmailVerification) return <Navigate to="/verify-email" replace />
  if (needsFaceEnrollment) return <Navigate to="/face-enrollment" replace />
  return <Navigate to="/" replace />
}

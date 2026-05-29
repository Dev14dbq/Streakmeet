import { useSearchParams } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import type { AuthUser } from '../../lib/api'
import VerifyEmailPage from './VerifyEmailPage'
import VerifyEmailConfirmPage from './VerifyEmailConfirmPage'

interface Props {
  user: AuthUser | null
  isLoggedIn: boolean
  onLogout: () => void | Promise<void>
  onUserUpdate: (user: AuthUser) => void
}

/** Публичное подтверждение по token / verified / error; иначе экран «проверьте почту» для залогиненных. */
export default function VerifyEmailRoute({ user, isLoggedIn, onLogout, onUserUpdate }: Props) {
  const [searchParams] = useSearchParams()
  const hasConfirmParams =
    searchParams.has('token') ||
    searchParams.get('verified') === '1' ||
    searchParams.get('error') === 'invalid'

  if (hasConfirmParams) {
    return <VerifyEmailConfirmPage />
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  return <VerifyEmailPage user={user!} onLogout={onLogout} onUserUpdate={onUserUpdate} />
}

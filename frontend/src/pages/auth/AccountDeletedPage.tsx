import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { restoreAccount, getApiErrorMessage, type AuthUser } from '../../lib/api'
import { takePendingRestore, type PendingRestore } from '../../lib/pendingRestore'
import { toastError } from '../../lib/toast'

interface DisplayState {
  email?: string
  daysRemaining?: number
}

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean) => void
}

function restorePayload(restore: PendingRestore) {
  if (restore.kind === 'google' && (restore.accessToken || restore.idToken)) {
    return {
      provider: 'google' as const,
      accessToken: restore.accessToken,
      idToken: restore.idToken,
    }
  }
  if (restore.kind === 'apple' && restore.idToken) {
    return { provider: 'apple' as const, idToken: restore.idToken }
  }
  if (restore.kind === 'email' && restore.email && restore.password) {
    return { email: restore.email, password: restore.password }
  }
  return null
}

export default function AccountDeletedPage({ onAuth }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const display = (location.state as DisplayState | null) ?? {}
  const [restore] = useState(() => takePendingRestore())

  const [loading, setLoading] = useState(false)
  const daysRemaining = restore?.daysRemaining ?? display.daysRemaining ?? 30
  const email =
    (restore?.kind === 'email' ? restore.email : undefined) ??
    (restore?.kind === 'google' ? restore.email : undefined) ??
    display.email

  async function handleRestore() {
    if (!restore) {
      toastError(t('auth.restoreInsufficient'))
      navigate('/login', { replace: true })
      return
    }

    const payload = restorePayload(restore)
    if (!payload) {
      toastError(t('auth.restoreInsufficient'))
      navigate('/login', { replace: true })
      return
    }

    setLoading(true)
    try {
      const { data } = await restoreAccount(payload)
      onAuth(data.user, data.accessToken)
    } catch (err: unknown) {
      toastError(getApiErrorMessage(err, t('auth.restoreFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] px-6 pt-4 pb-safe">
      <div className="flex flex-1 flex-col items-center justify-center max-w-sm mx-auto w-full">
        <div className="mb-8 text-6xl select-none">🗑️</div>
        <h1 className="text-2xl font-extrabold text-on-surface tracking-tight text-center">
          {t('auth.accountDeleted')}
        </h1>
        <p className="mt-4 text-sm text-[var(--color-on-surface-variant)] text-center leading-relaxed">
          {t('auth.accountDeletedDesc')}{' '}
          <span className="text-on-surface font-semibold">
            {daysRemaining} {t('common.days', { count: daysRemaining })}
          </span>{' '}
          {t('auth.accountDeletedDesc2')}
        </p>
        {email && (
          <p className="mt-3 text-xs text-[var(--color-on-surface-variant)] text-center">{email}</p>
        )}
        <p className="mt-6 text-sm text-[var(--color-on-surface-variant)] text-center">
          {t('auth.restorePrompt')}
        </p>
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col gap-3 pb-6">
        <button
          type="button"
          onClick={handleRestore}
          disabled={loading || !restore}
          className="btn btn--primary btn--lg w-full"
        >
          {loading ? t('auth.restoring') : t('auth.restoreAccount')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          disabled={loading}
          className="btn btn--ghost w-full"
        >
          {t('auth.keepDeleted')}
        </button>
      </div>
    </div>
  )
}

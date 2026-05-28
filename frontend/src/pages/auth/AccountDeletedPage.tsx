import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { restoreAccount, getApiErrorMessage, type AuthUser } from '../../lib/api'
import { toastError } from '../../lib/toast'

interface LocationState {
  email?: string
  password?: string
  provider?: 'google' | 'apple'
  accessToken?: string
  idToken?: string
  daysRemaining?: number
}

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean) => void
}

export default function AccountDeletedPage({ onAuth }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? {}

  const [loading, setLoading] = useState(false)
  const daysRemaining = state.daysRemaining ?? 30

  async function handleRestore() {
    setLoading(true)
    try {
      let payload
      if (state.provider === 'google' && (state.accessToken || state.idToken)) {
        payload = {
          provider: 'google' as const,
          accessToken: state.accessToken,
          idToken: state.idToken,
        }
      } else if (state.provider === 'apple' && state.idToken) {
        payload = { provider: 'apple' as const, idToken: state.idToken }
      } else if (state.email && state.password) {
        payload = { email: state.email, password: state.password }
      } else {
        toastError(t('auth.restoreInsufficient'))
        navigate('/login', { replace: true })
        return
      }

      const { data } = await restoreAccount(payload)
      localStorage.setItem('accessToken', data.accessToken)
      onAuth(data.user, data.accessToken)
    } catch (err: unknown) {
      toastError(getApiErrorMessage(err, t('auth.restoreFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] px-6 pt-14 pb-safe">
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
        {state.email && (
          <p className="mt-3 text-xs text-[var(--color-on-surface-variant)] text-center">
            {state.email}
          </p>
        )}
        <p className="mt-6 text-sm text-[var(--color-on-surface-variant)] text-center">
          {t('auth.restorePrompt')}
        </p>
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col gap-3 pb-6">
        <button
          type="button"
          onClick={handleRestore}
          disabled={loading}
          className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {loading ? t('auth.restoring') : t('auth.restoreAccount')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          disabled={loading}
          className="w-full py-4 text-sm font-semibold text-[var(--color-on-surface-variant)] hover:text-white transition"
        >
          {t('auth.keepDeleted')}
        </button>
      </div>
    </div>
  )
}

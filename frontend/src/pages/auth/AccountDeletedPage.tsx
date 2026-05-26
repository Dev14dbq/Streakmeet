import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { restoreAccount, type AuthUser } from '../../lib/api'
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
        toastError('Недостаточно данных для восстановления — войдите снова')
        navigate('/login', { replace: true })
        return
      }

      const { data } = await restoreAccount(payload)
      localStorage.setItem('accessToken', data.accessToken)
      onAuth(data.user, data.accessToken)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Не удалось восстановить аккаунт'
      toastError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-black px-6 pt-14 pb-safe">
      <div className="flex flex-1 flex-col items-center justify-center max-w-sm mx-auto w-full">
        <div className="mb-8 text-6xl select-none">🗑️</div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight text-center">
          Аккаунт удалён
        </h1>
        <p className="mt-4 text-sm text-[var(--color-on-surface-variant)] text-center leading-relaxed">
          Ваш аккаунт был удалён, но все данные ещё хранятся{' '}
          <span className="text-white font-semibold">{daysRemaining} дн.</span> — после этого они
          будут удалены навсегда.
        </p>
        {state.email && (
          <p className="mt-3 text-xs text-[var(--color-on-surface-variant)] text-center">
            {state.email}
          </p>
        )}
        <p className="mt-6 text-sm text-white/80 text-center">
          Хотите восстановить аккаунт со всеми сериями и друзьями?
        </p>
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col gap-3 pb-6">
        <button
          type="button"
          onClick={handleRestore}
          disabled={loading}
          className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Восстанавливаем...' : 'Восстановить аккаунт'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          disabled={loading}
          className="w-full py-4 text-sm font-semibold text-[var(--color-on-surface-variant)] hover:text-white transition"
        >
          Нет, оставить удалённым
        </button>
      </div>
    </div>
  )
}

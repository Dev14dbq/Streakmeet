import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { register, type AuthUser } from '../../lib/api'
import { getDeviceTimezone } from '../../lib/timezone'

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean) => void
}

export default function RegisterDetailsPage({ onAuth }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const emailFromState = (location.state as { email?: string })?.email ?? ''

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e: Record<string, string> = {}
    if (!displayName.trim()) e.displayName = 'Введите имя'
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      e.username = 'Только a-z, 0-9, _, от 3 до 20 символов'
    }
    if (password.length < 6) e.password = 'Минимум 6 символов'
    if (password !== confirmPassword) e.confirmPassword = 'Пароли не совпадают'
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length > 0) {
      setErrors(e)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const { data } = await register({
        email: emailFromState,
        password,
        nickname: displayName.trim(),
        username: username.toLowerCase(),
        timezone: getDeviceTimezone(),
      })
      localStorage.setItem('accessToken', data.accessToken)
      onAuth(data.user, data.accessToken, true)
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; code?: string } } })?.response
        ?.data
      const msg = resp?.error ?? 'Ошибка регистрации'
      if (resp?.code === 'ACCOUNT_DELETED') {
        navigate('/login/email', { state: { email: emailFromState, deletedHint: true } })
        return
      }
      if (msg.toLowerCase().includes('username')) {
        setErrors({ username: 'Этот ник уже занят' })
      } else {
        setErrors({ general: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-14 pb-4">
        <button
          onClick={() => navigate('/login')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] text-white transition hover:bg-[var(--color-surface-container-highest)] active:scale-95"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Создать аккаунт</h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">{emailFromState}</p>
        </div>
      </div>

      <form
        className="flex flex-col px-6 mt-6 pb-12"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        {emailFromState && (
          <input type="hidden" name="email" autoComplete="email" value={emailFromState} readOnly />
        )}

        {errors.general && (
          <div className="mb-6 rounded-2xl bg-[var(--color-error-container)] px-5 py-4 text-sm text-[var(--color-on-error-container)]">
            {errors.general}
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* Display name */}
          <div>
            <label htmlFor="reg-name" className="sr-only">
              Имя
            </label>
            <input
              id="reg-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Имя (Как тебя зовут?)"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setErrors((prev) => ({ ...prev, displayName: '' }))
              }}
              className="w-full rounded-full bg-[var(--color-surface-container-high)] px-6 py-4 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)]"
            />
            {errors.displayName && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">{errors.displayName}</p>
            )}
          </div>

          {/* Username */}
          <div>
            <label htmlFor="reg-username" className="sr-only">
              Уникальный ник
            </label>
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)] font-medium">
                @
              </span>
              <input
                id="reg-username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Уникальный ник (username)"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  setErrors((prev) => ({ ...prev, username: '' }))
                }}
                maxLength={20}
                className="w-full rounded-full bg-[var(--color-surface-container-high)] py-4 pl-10 pr-6 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)]"
              />
            </div>
            {errors.username ? (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">{errors.username}</p>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-on-surface-variant)] pl-4">
                Только строчные буквы, цифры и _
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="sr-only">
              Пароль
            </label>
            <input
              id="reg-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Пароль (минимум 6 символов)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors((prev) => ({ ...prev, password: '' }))
              }}
              className="w-full rounded-full bg-[var(--color-surface-container-high)] px-6 py-4 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)]"
            />
            {errors.password && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">{errors.password}</p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label htmlFor="reg-password-confirm" className="sr-only">
              Повторите пароль
            </label>
            <input
              id="reg-password-confirm"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setErrors((prev) => ({ ...prev, confirmPassword: '' }))
              }}
              className="w-full rounded-full bg-[var(--color-surface-container-high)] px-6 py-4 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)]"
            />
            {errors.confirmPassword && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white transition hover:bg-[var(--color-primary-container)] active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
          >
            {loading ? 'Создаём аккаунт...' : 'Создать аккаунт →'}
          </button>
        </div>
      </form>
    </div>
  )
}

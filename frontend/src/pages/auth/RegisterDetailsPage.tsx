import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { register, getApiErrorMessage, type AuthUser } from '../../lib/api'
import { getDeviceTimezone } from '../../lib/timezone'

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean) => void
}

export default function RegisterDetailsPage({ onAuth }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const emailFromState = (location.state as { email?: string })?.email ?? ''

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e: Record<string, string> = {}
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      e.username = t('auth.usernameRules')
    }
    if (password.length < 6) e.password = t('auth.passwordMin')
    if (password !== confirmPassword) e.confirmPassword = t('auth.passwordMismatch')
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
      const normalizedUsername = username.toLowerCase()
      const { data } = await register({
        email: emailFromState,
        password,
        nickname: normalizedUsername,
        username: normalizedUsername,
        timezone: getDeviceTimezone(),
      })
      localStorage.setItem('accessToken', data.accessToken)
      onAuth(data.user, data.accessToken, true)
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; code?: string } } })?.response
        ?.data
      const msg = getApiErrorMessage(err, t('auth.registerError'))
      if (resp?.code === 'ACCOUNT_DELETED') {
        navigate('/login/email', { state: { email: emailFromState, deletedHint: true } })
        return
      }
      if (msg.toLowerCase().includes('username')) {
        setErrors({ username: msg })
      } else {
        setErrors({ general: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <div className="flex items-center gap-4 px-6 pt-14 pb-4">
        <button
          onClick={() => navigate('/login')}
          className="btn btn--icon-lg btn--secondary shrink-0"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
            {t('auth.createAccount')}
          </h1>
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
          <div>
            <label htmlFor="reg-username" className="sr-only">
              {t('auth.usernamePlaceholder')}
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
                placeholder={t('auth.usernamePlaceholder')}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  setErrors((prev) => ({ ...prev, username: '' }))
                }}
                maxLength={20}
                className="field pl-10"
              />
            </div>
            {errors.username && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">{errors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="reg-password" className="sr-only">
              {t('auth.password')}
            </label>
            <input
              id="reg-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors((prev) => ({ ...prev, password: '' }))
              }}
              className="field"
            />
            {errors.password && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">{errors.password}</p>
            )}
          </div>

          <div>
            <label htmlFor="reg-password-confirm" className="sr-only">
              {t('auth.confirmPasswordPlaceholder')}
            </label>
            <input
              id="reg-password-confirm"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setErrors((prev) => ({ ...prev, confirmPassword: '' }))
              }}
              className="field"
            />
            {errors.confirmPassword && (
              <p className="mt-2 text-xs text-[var(--color-error)] pl-4">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn--primary btn--lg mt-4 w-full">
            {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
          </button>
        </div>
      </form>
    </div>
  )
}

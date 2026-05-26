import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  checkEmail,
  login,
  getDeletedAccountInfo,
  getApiErrorMessage,
  type AuthUser,
} from '../../lib/api'

type Step = 'email' | 'password'

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean, returnTo?: string) => void
}

export default function EmailAuthPage({ onAuth }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'password') setTimeout(() => passwordRef.current?.focus(), 150)
  }, [step])

  async function handleEmailContinue() {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError(t('auth.invalidEmail'))
      return
    }
    setEmailError('')
    setLoading(true)
    try {
      const { data } = await checkEmail(trimmed)
      if (data.exists) {
        setStep('password')
      } else {
        navigate('/register', { state: { email: trimmed } })
      }
    } catch (e) {
      setEmailError(getApiErrorMessage(e, t('auth.networkError')))
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    if (!password) {
      setPasswordError(t('auth.enterPasswordPrompt'))
      return
    }
    setPasswordError('')
    setLoading(true)
    try {
      const { data } = await login(email.trim(), password)
      localStorage.setItem('accessToken', data.accessToken)
      onAuth(data.user, data.accessToken, false, returnTo)
    } catch (err) {
      const deleted = getDeletedAccountInfo(err)
      if (deleted) {
        navigate('/account-deleted', {
          replace: true,
          state: {
            email: email.trim(),
            password,
            daysRemaining: deleted.daysRemaining,
          },
        })
        return
      }
      setPasswordError(getApiErrorMessage(err, t('auth.wrongPassword')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-14 pb-4">
        <button
          onClick={() => (step === 'password' ? setStep('email') : navigate('/login'))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] text-white transition hover:bg-[var(--color-surface-container-highest)] active:scale-95"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          {step === 'email' ? t('auth.emailLogin') : t('auth.enterPassword')}
        </h1>
      </div>

      {/* Content */}
      <form
        className="flex flex-col px-6 mt-6"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault()
          if (step === 'email') handleEmailContinue()
          else handleLogin()
        }}
      >
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="login-email" className="sr-only">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              autoFocus
              disabled={step === 'password'}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailError('')
              }}
              className="w-full rounded-full bg-[var(--color-surface-container-high)] px-6 py-4 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)] text-base disabled:opacity-50"
            />
            {emailError && (
              <p className="mt-2 text-sm text-[var(--color-error)] pl-4">{emailError}</p>
            )}
          </div>

          {step === 'password' && (
            <div>
              <label htmlFor="login-password" className="sr-only">
                {t('auth.password')}
              </label>
              <input
                id="login-password"
                name="password"
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError('')
                }}
                className="w-full rounded-full bg-[var(--color-surface-container-high)] px-6 py-4 text-white placeholder-[var(--color-on-surface-variant)] outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)] text-base"
              />
              {passwordError && (
                <p className="mt-2 text-sm text-[var(--color-error)] pl-4">{passwordError}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white transition hover:bg-[var(--color-primary-container)] active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)] mt-2"
          >
            {loading ? '...' : step === 'email' ? t('auth.continue') : t('auth.signIn')}
          </button>
        </div>
      </form>
    </div>
  )
}

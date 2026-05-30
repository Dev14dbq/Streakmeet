import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import type { AuthUser } from '../../lib/api'
import { completeGoogleSignIn } from '../../lib/completeGoogleSignIn'
import {
  consumeGoogleRedirectTokens,
  initGoogleAuth,
  isGoogleAuthCancelled,
  signInWithGoogleNative,
  useGoogleRedirectFlow,
  useNativeGoogleSignIn,
  type GoogleSignInTokens,
} from '../../lib/googleAuth'
import { Flame } from 'lucide-react'
import { toastError, toastInfo } from '../../lib/toast'
import { getApiErrorMessage } from '../../lib/api'

interface Props {
  onAuth: (user: AuthUser, token: string, fromSignup?: boolean, returnTo?: string) => void
}

export default function AuthPage({ onAuth }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  const [googleLoading, setGoogleLoading] = useState(false)

  async function finishGoogleSignIn(tokens: { accessToken?: string; idToken?: string }) {
    const result = await completeGoogleSignIn(tokens)
    if (result.ok) {
      localStorage.setItem('accessToken', result.accessToken)
      onAuth(result.user, result.accessToken, false, returnTo)
      return
    }
    if (result.deleted) {
      navigate('/account-deleted', {
        replace: true,
        state: {
          provider: 'google',
          accessToken: result.tokens.accessToken,
          idToken: result.tokens.idToken,
          email: result.deleted.email,
          daysRemaining: result.deleted.daysRemaining,
        },
      })
      return
    }
    toastError(result.errorMessage)
  }

  useEffect(() => {
    void initGoogleAuth()
  }, [])

  useEffect(() => {
    if (!useGoogleRedirectFlow()) return
    const tokens = consumeGoogleRedirectTokens()
    if (!tokens) return

    setGoogleLoading(true)
    void finishGoogleSignIn(tokens).finally(() => setGoogleLoading(false))
  }, []) // legacy redirect return URL; new logins use GIS id_token

  // GIS id_token on all web browsers (desktop + mobile). Avoids redirect_uri_mismatch
  // from the legacy implicit redirect flow unless explicitly configured in Google Console.
  const useWebCredentialButton = !useNativeGoogleSignIn()

  async function runGoogleSignIn(tokens: GoogleSignInTokens) {
    setGoogleLoading(true)
    try {
      await finishGoogleSignIn(tokens)
    } finally {
      setGoogleLoading(false)
    }
  }

  function handleGoogleCredentialSuccess(credential?: string) {
    if (!credential) {
      toastInfo(t('auth.googleCancelled'))
      return
    }
    void runGoogleSignIn({ idToken: credential })
  }

  async function handleGoogleNative() {
    if (googleLoading) return
    setGoogleLoading(true)
    try {
      const tokens = await signInWithGoogleNative()
      await finishGoogleSignIn(tokens)
    } catch (err) {
      if (isGoogleAuthCancelled(err)) {
        toastInfo(t('auth.googleCancelled'))
      } else {
        toastError(getApiErrorMessage(err, t('auth.googleError')))
      }
    } finally {
      setGoogleLoading(false)
    }
  }

  // ─── Apple ───────────────────────────────────────────────────────────────────
  function handleApple() {
    const clientId = import.meta.env.VITE_APPLE_CLIENT_ID
    if (!clientId) {
      toastInfo(t('auth.appleNotConfigured'))
      return
    }
    const redirectUri = encodeURIComponent(`${window.location.origin}/login`)
    const state = Math.random().toString(36).slice(2)
    sessionStorage.setItem('apple_state', state)
    const url = [
      'https://appleid.apple.com/auth/authorize',
      `?client_id=${clientId}`,
      `&redirect_uri=${redirectUri}`,
      `&response_type=code id_token`,
      `&scope=email name`,
      `&response_mode=form_post`,
      `&state=${state}`,
    ].join('')
    window.location.href = url
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      {/* Центральная часть */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative mb-3 select-none">
          <div className="absolute inset-0 m-auto h-28 w-28 rounded-full bg-[var(--color-brand-primary)] opacity-20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] ring-1 ring-[var(--color-outline-variant)]/40 drop-shadow-[0_0_20px_rgba(255,26,79,0.5)]">
            <Flame size={44} className="text-[var(--color-brand-primary)]" fill="currentColor" />
          </div>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">StreakMeet</h1>
        <p className="mt-3 text-center text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
          {t('app.tagline')}
          <br />
          {t('app.taglineSub')}
        </p>
      </div>

      {/* Кнопки внизу */}
      <div className="flex flex-col gap-3 px-6 pb-12">
        <AuthButton
          icon={<AppleIcon />}
          label={t('auth.signInApple')}
          onClick={handleApple}
          className="bg-[var(--color-surface-container-high)] text-on-surface hover:bg-[var(--color-surface-container-highest)]"
        />
        {useWebCredentialButton ? (
          <WebGoogleSignInButton
            label={googleLoading ? t('common.connecting') : t('auth.signInGoogle')}
            disabled={googleLoading}
            onCredential={handleGoogleCredentialSuccess}
            onCancelled={() => toastInfo(t('auth.googleCancelled'))}
          />
        ) : (
          <AuthButton
            icon={<GoogleIcon />}
            label={googleLoading ? t('common.connecting') : t('auth.signInGoogle')}
            onClick={handleGoogleNative}
            disabled={googleLoading}
            className="bg-[var(--color-surface-container-high)] text-on-surface hover:bg-[var(--color-surface-container-highest)] disabled:opacity-60"
          />
        )}
        <AuthButton
          icon={<MailIcon />}
          label={t('auth.continueEmail')}
          onClick={() => navigate('/login/email')}
          className="bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-primary-container)] shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
        />

        <p className="mt-2 text-center text-xs text-zinc-700">
          {t('auth.termsAgree')}{' '}
          <a href="/terms" className="underline hover:text-zinc-500">
            {t('auth.terms')}
          </a>{' '}
          {t('auth.and')}{' '}
          <a href="/privacy" className="underline hover:text-zinc-500">
            {t('auth.privacyPolicy')}
          </a>
        </p>
      </div>
    </div>
  )
}

/** Desktop browser: GIS credential button (id_token) — more reliable than token-client popup. */
function WebGoogleSignInButton({
  label,
  disabled,
  onCredential,
  onCancelled,
}: {
  label: string
  disabled?: boolean
  onCredential: (credential?: string) => void
  onCancelled: () => void
}) {
  return (
    <div className="relative w-full min-h-[52px]">
      <div
        className={[
          'absolute inset-0 z-20 flex items-center justify-center overflow-hidden',
          disabled ? 'pointer-events-none opacity-50' : '',
        ].join(' ')}
        aria-hidden={disabled}
      >
        <div className="w-full opacity-[0.011] scale-[1.02]">
          <GoogleLogin
            onSuccess={(res) => onCredential(res.credential)}
            onError={() => onCancelled()}
            ux_mode="popup"
            use_fedcm_for_button={false}
            theme="outline"
            size="large"
            shape="pill"
            text="signin_with"
            width="400"
          />
        </div>
      </div>
      <div className="pointer-events-none relative z-10">
        <AuthButton
          icon={<GoogleIcon />}
          label={label}
          onClick={() => {}}
          disabled={disabled}
          className="bg-[var(--color-surface-container-high)] text-white hover:bg-[var(--color-surface-container-highest)] disabled:opacity-60"
        />
      </div>
    </div>
  )
}

function AuthButton({
  icon,
  label,
  onClick,
  className,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className: string
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`btn btn--lg w-full ${className}`}>
      {icon}
      {label}
    </button>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m2 7 10 7 10-7" />
    </svg>
  )
}

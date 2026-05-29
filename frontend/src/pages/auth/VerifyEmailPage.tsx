import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, LogOut } from 'lucide-react'
import type { AuthUser } from '../../lib/api'
import { api, resendVerificationEmail } from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError, toastSuccess } from '../../lib/toast'

interface Props {
  user: AuthUser
  onLogout: () => void
  onUserUpdate: (user: AuthUser) => void
}

export default function VerifyEmailPage({ user, onLogout, onUserUpdate }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const verified = searchParams.get('verified') === '1'
  const invalid = searchParams.get('error') === 'invalid'
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!verified) return
    void api.get<AuthUser>(SWR_KEYS.me).then(({ data }) => {
      onUserUpdate(data)
      localStorage.setItem('user', JSON.stringify(data))
    })
  }, [verified, onUserUpdate])

  async function handleResend() {
    setLoading(true)
    try {
      await resendVerificationEmail()
      setSent(true)
      toastSuccess(t('verifyEmail.sent'))
    } catch {
      toastError(t('verifyEmail.sendFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (verified || user.emailVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary-container)]">
          <Mail size={36} className="text-[var(--color-brand-primary)]" />
        </div>
        <h1 className="mb-2 text-2xl font-extrabold text-on-surface">
          {t('verifyEmail.verifiedTitle')}
        </h1>
        <p className="mb-8 max-w-sm text-sm text-[var(--color-on-surface-variant)]">
          {t('verifyEmail.verifiedDescription')}
        </p>
        <button
          type="button"
          onClick={() => navigate(user.faceEnrolled ? '/' : '/face-enrollment', { replace: true })}
          className="btn btn--primary btn--lg w-full max-w-xs"
        >
          {user.faceEnrolled ? t('verifyEmail.continueApp') : t('verifyEmail.continueEnrollment')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] px-6 py-12">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface-container-high)]">
          <Mail size={36} className="text-[var(--color-brand-primary)]" />
        </div>
        <h1 className="mb-2 text-2xl font-extrabold text-on-surface">{t('verifyEmail.title')}</h1>
        <p className="mb-2 max-w-sm text-sm text-[var(--color-on-surface-variant)]">
          {t('verifyEmail.description')}
        </p>
        <p className="mb-6 font-semibold text-on-surface">{user.email}</p>
        {invalid && (
          <p className="mb-4 text-sm text-[var(--color-error)]">{t('verifyEmail.invalidLink')}</p>
        )}
        {sent && (
          <p className="mb-4 text-sm text-[var(--color-brand-primary)]">
            {t('verifyEmail.checkInbox')}
          </p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleResend()}
          className="btn btn--primary btn--lg mb-4 w-full max-w-xs"
        >
          {loading ? t('common.loading') : t('verifyEmail.resend')}
        </button>
      </div>
      <button type="button" onClick={onLogout} className="btn btn--ghost mx-auto">
        <LogOut size={16} />
        {t('settings.signOut')}
      </button>
    </div>
  )
}

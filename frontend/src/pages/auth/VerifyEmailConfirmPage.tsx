import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, Mail, XCircle } from 'lucide-react'
import { confirmEmailVerification, getApiErrorMessage } from '../../lib/api'

type Status = 'loading' | 'success' | 'error' | 'invalid'

export default function VerifyEmailConfirmPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const legacyVerified = searchParams.get('verified') === '1'
  const legacyInvalid = searchParams.get('error') === 'invalid'

  const [status, setStatus] = useState<Status>(() => {
    if (legacyVerified) return 'success'
    if (legacyInvalid) return 'invalid'
    if (token) return 'loading'
    return 'error'
  })

  useEffect(() => {
    if (!token || legacyVerified || legacyInvalid) return

    let cancelled = false
    void confirmEmailVerification(token)
      .then(async () => {
        if (cancelled) return
        setStatus('success')
        if (localStorage.getItem('accessToken')) {
          try {
            const { api } = await import('../../lib/api')
            const { SWR_KEYS } = await import('../../lib/swrKeys')
            const { data } = await api.get(SWR_KEYS.me)
            localStorage.setItem('user', JSON.stringify(data))
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = getApiErrorMessage(err)
          if (msg.includes('недействительна') || msg.includes('invalid')) {
            setStatus('invalid')
          } else {
            setStatus('error')
          }
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, legacyVerified, legacyInvalid])

  function goNext() {
    const hasToken = !!localStorage.getItem('accessToken')
    if (hasToken) {
      navigate('/', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 py-12 text-center">
      {status === 'loading' && (
        <>
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface-container-high)]">
            <Mail size={36} className="animate-pulse text-[var(--color-brand-primary)]" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-on-surface">
            {t('verifyEmail.confirming')}
          </h1>
          <p className="text-sm text-[var(--color-on-surface-variant)]">{t('common.loading')}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary-container)]">
            <CheckCircle size={40} className="text-[var(--color-brand-primary)]" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-on-surface">
            {t('verifyEmail.verifiedTitle')}
          </h1>
          <p className="mb-8 max-w-sm text-sm text-[var(--color-on-surface-variant)]">
            {t('verifyEmail.verifiedDescription')}
          </p>
          <button
            type="button"
            onClick={goNext}
            className="w-full max-w-xs rounded-2xl bg-[var(--color-brand-primary)] py-4 font-bold text-white transition active:scale-[0.98]"
          >
            {t('verifyEmail.continueApp')}
          </button>
        </>
      )}

      {status === 'invalid' && (
        <>
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-error-container)]">
            <XCircle size={40} className="text-[var(--color-error)]" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-on-surface">
            {t('verifyEmail.invalidTitle')}
          </h1>
          <p className="mb-8 max-w-sm text-sm text-[var(--color-on-surface-variant)]">
            {t('verifyEmail.invalidLink')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full max-w-xs rounded-2xl bg-[var(--color-brand-primary)] py-4 font-bold text-white"
          >
            {t('auth.signIn')}
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-error-container)]">
            <XCircle size={40} className="text-[var(--color-error)]" />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-on-surface">
            {t('verifyEmail.confirmFailed')}
          </h1>
          <p className="mb-8 max-w-sm text-sm text-[var(--color-on-surface-variant)]">
            {t('verifyEmail.confirmFailedHint')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full max-w-xs rounded-2xl bg-[var(--color-brand-primary)] py-4 font-bold text-white"
          >
            {t('auth.signIn')}
          </button>
        </>
      )}
    </div>
  )
}

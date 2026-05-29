import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { forgotPassword, getApiErrorMessage } from '../../lib/api'
import { toastSuccess } from '../../lib/toast'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!email.includes('@')) {
      setError(t('auth.invalidEmail'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email.trim().toLowerCase())
      setSent(true)
      toastSuccess(t('forgotPassword.sent'))
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('forgotPassword.error')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] px-6 py-12">
      <button
        type="button"
        onClick={() => navigate('/login/email')}
        className="mb-8 self-start text-sm text-[var(--color-on-surface-variant)]"
      >
        ← {t('common.back')}
      </button>
      <h1 className="mb-2 text-2xl font-extrabold text-on-surface">{t('forgotPassword.title')}</h1>
      <p className="mb-6 text-sm text-[var(--color-on-surface-variant)]">
        {t('forgotPassword.description')}
      </p>
      {sent ? (
        <p className="text-sm text-[var(--color-brand-primary)]">
          {t('forgotPassword.checkInbox')}
        </p>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className="field mb-4 border border-subtle"
            autoComplete="email"
          />
          {error && <p className="mb-4 text-sm text-[var(--color-error)]">{error}</p>}
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSubmit()}
            className="btn btn--primary btn--lg w-full"
          >
            {loading ? t('common.loading') : t('forgotPassword.submit')}
          </button>
        </>
      )}
    </div>
  )
}

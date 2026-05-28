import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword, getApiErrorMessage } from '../../lib/api'
import { toastSuccess } from '../../lib/toast'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (password.length < 6) {
      setError(t('auth.passwordMin'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    if (!token) {
      setError(t('resetPassword.invalidToken'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await resetPassword(token, password)
      toastSuccess(t('resetPassword.success'))
      navigate('/login/email', { replace: true })
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t('resetPassword.error')))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-[var(--color-error)]">{t('resetPassword.invalidToken')}</p>
        <button
          type="button"
          onClick={() => navigate('/forgot-password')}
          className="mt-4 text-[var(--color-brand-primary)]"
        >
          {t('forgotPassword.title')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] px-6 py-12">
      <h1 className="mb-2 text-2xl font-extrabold text-on-surface">{t('resetPassword.title')}</h1>
      <p className="mb-6 text-sm text-[var(--color-on-surface-variant)]">{t('resetPassword.description')}</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('auth.passwordPlaceholder')}
        className="mb-3 w-full rounded-2xl border border-subtle bg-[var(--color-surface-container)] px-4 py-3 text-on-surface outline-none"
        autoComplete="new-password"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={t('auth.confirmPasswordPlaceholder')}
        className="mb-4 w-full rounded-2xl border border-subtle bg-[var(--color-surface-container)] px-4 py-3 text-on-surface outline-none"
        autoComplete="new-password"
      />
      {error && <p className="mb-4 text-sm text-[var(--color-error)]">{error}</p>}
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleSubmit()}
        className="w-full rounded-2xl bg-[var(--color-brand-primary)] py-4 font-bold text-white disabled:opacity-60"
      >
        {loading ? t('common.loading') : t('resetPassword.submit')}
      </button>
    </div>
  )
}

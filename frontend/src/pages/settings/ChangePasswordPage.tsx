import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { changePassword, getApiErrorMessage } from '../../lib/api'
import { toastSuccess } from '../../lib/toast'
import { SettingsPageShell } from './settingsUi'

export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!currentPassword) {
      setError(t('settings.currentPasswordRequired'))
      return
    }
    if (password.length < 6) {
      setError(t('auth.passwordMin'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }

    setError('')
    setLoading(true)
    try {
      await changePassword(currentPassword, password)
      toastSuccess(t('settings.passwordChanged'))
      navigate('/settings/privacy', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, t('settings.passwordChangeFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsPageShell
      title={t('settings.changePassword')}
      subtitle={t('settings.changePasswordIntro')}
      backTo="/settings/privacy"
      backLabel={t('common.back')}
    >
      <div className="glass-card rounded-3xl p-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
          {t('settings.currentPassword')}
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="field mb-4 border border-subtle"
          autoComplete="current-password"
          placeholder={t('settings.currentPasswordPlaceholder')}
        />

        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
          {t('settings.newPassword')}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mb-3 border border-subtle"
          autoComplete="new-password"
          placeholder={t('auth.passwordPlaceholder')}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field mb-4 border border-subtle"
          autoComplete="new-password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
        />

        {error && <p className="mb-4 text-sm text-[var(--color-error)]">{error}</p>}

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleSubmit()}
          className="btn btn--primary btn--lg w-full"
        >
          {loading ? t('common.saving') : t('settings.savePassword')}
        </button>
      </div>
    </SettingsPageShell>
  )
}

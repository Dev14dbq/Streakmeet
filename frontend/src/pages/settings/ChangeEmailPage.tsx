import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { getApiErrorMessage, updateEmail, type AuthUser } from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastSuccess } from '../../lib/toast'
import { SettingsPageShell } from './settingsUi'

interface Props {
  user: AuthUser
  onUserUpdate?: (user: AuthUser) => void
}

export default function ChangeEmailPage({ user, onUserUpdate }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me, mutate } = useSWR<AuthUser>(SWR_KEYS.me)
  const currentUser = me ?? user
  const [email, setEmail] = useState(currentUser.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    const normalized = email.trim().toLowerCase()
    if (!normalized.includes('@')) {
      setError(t('settings.invalidEmail'))
      return
    }
    if (!currentPassword) {
      setError(t('settings.currentPasswordRequired'))
      return
    }
    if (normalized === currentUser.email) {
      navigate('/settings/privacy')
      return
    }

    setError('')
    setLoading(true)
    try {
      const { data: updated } = await updateEmail(normalized, currentPassword)
      const next = { ...currentUser, ...updated }
      mutate(next, false)
      onUserUpdate?.(next)
      toastSuccess(t('settings.emailChanged'))
      navigate('/settings/privacy', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, t('settings.emailChangeFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SettingsPageShell
      title={t('settings.changeEmail')}
      subtitle={t('settings.changeEmailIntro')}
      backTo="/settings/privacy"
      backLabel={t('common.back')}
    >
      <div className="glass-card rounded-3xl p-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
          {t('settings.newEmail')}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field mb-4 border border-subtle"
          autoComplete="email"
        />

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

        {error && <p className="mb-4 text-sm text-[var(--color-error)]">{error}</p>}

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleSubmit()}
          className="btn btn--primary btn--lg w-full"
        >
          {loading ? t('common.saving') : t('settings.saveEmail')}
        </button>
      </div>
    </SettingsPageShell>
  )
}

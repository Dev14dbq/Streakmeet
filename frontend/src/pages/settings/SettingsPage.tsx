import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Camera,
  FileText,
  HelpCircle,
  Languages,
  LogOut,
  Mail,
  Palette,
  ScanFace,
  Shield,
  Trash2,
} from 'lucide-react'
import useSWR from 'swr'
import { deleteAccount, syncDeviceTimezone, type AuthUser } from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError } from '../../lib/toast'
import { stopLocationSharing } from '../../lib/locationSharing'
import { SettingsPageShell, SettingsRow, SettingsSection } from './settingsUi'

interface Props {
  user: AuthUser
  onUserUpdate?: (user: AuthUser) => void
}

export default function SettingsPage({ user: initialUser }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me, mutate } = useSWR<AuthUser & { timezone?: string }>(SWR_KEYS.me)

  useEffect(() => {
    syncDeviceTimezone()
      .then((tz) => {
        mutate({ ...(me ?? initialUser), timezone: tz } as AuthUser & { timezone: string }, false)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    if (!confirm(t('settings.logoutConfirm'))) return
    await stopLocationSharing().catch(() => {})
    localStorage.clear()
    window.location.href = '/login'
  }

  async function handleDeleteAccount() {
    if (!confirm(t('settings.deleteConfirm'))) return
    try {
      await deleteAccount()
      await stopLocationSharing().catch(() => {})
      localStorage.clear()
      window.location.href = '/login'
    } catch {
      toastError(t('settings.deleteFailed'))
    }
  }

  const user = me ?? initialUser

  return (
    <SettingsPageShell title={t('settings.title')} backTo="/profile" backLabel={t('common.back')}>
      <SettingsSection title={t('settings.sections')}>
        <SettingsRow
          icon={Palette}
          label={t('theme.title')}
          description={t('settings.appearanceDesc')}
          onClick={() => navigate('/settings/appearance')}
        />
        <SettingsRow
          icon={Languages}
          label={t('language.title')}
          description={t('language.description')}
          onClick={() => navigate('/settings/language')}
        />
        <SettingsRow
          icon={Bell}
          label={t('settings.notifications')}
          description={t('settings.notificationsDesc')}
          onClick={() => navigate('/settings/notifications')}
        />
        <SettingsRow
          icon={Shield}
          label={t('settings.privacy')}
          description={t('settings.privacyDesc')}
          onClick={() => navigate('/settings/privacy')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.account')}>
        <SettingsRow
          icon={Mail}
          label={t('settings.email')}
          description={user.email}
          onClick={() => navigate('/settings/email')}
        />
        <SettingsRow
          icon={Camera}
          label={t('settings.profilePhoto')}
          description={t('settings.changeAvatar')}
          onClick={() => navigate('/profile', { state: { openAvatarSheet: true } })}
        />
        <SettingsRow
          icon={ScanFace}
          label={t('face.faceRecognition')}
          description={user.faceEnrolled ? t('face.registered') : t('face.notConfigured')}
          onClick={() => navigate('/face-enrollment')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.about')}>
        <SettingsRow
          icon={FileText}
          label={t('settings.terms')}
          onClick={() => navigate('/terms')}
        />
        <SettingsRow
          icon={Shield}
          label={t('settings.privacyPolicy')}
          onClick={() => navigate('/privacy')}
        />
        <SettingsRow
          icon={HelpCircle}
          label={t('settings.support')}
          description="support@streakmeet.app"
          onClick={() => {
            window.location.href = 'mailto:support@streakmeet.app'
          }}
        />
        <div className="px-4 py-3 text-center">
          <span className="text-xs text-[var(--color-on-surface-variant)]">{t('app.version')}</span>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.session')}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-4 py-4 text-[var(--color-error)] transition hover:bg-white/5 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-error)]/10">
            <LogOut size={18} />
          </div>
          <span className="text-sm font-semibold">{t('settings.signOut')}</span>
        </button>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="flex w-full items-center gap-3 border-t border-subtle px-4 py-4 text-[var(--color-on-surface-variant)] transition hover:bg-white/5 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
            <Trash2 size={18} />
          </div>
          <span className="text-sm font-medium">{t('settings.deleteAccount')}</span>
        </button>
      </SettingsSection>
    </SettingsPageShell>
  )
}

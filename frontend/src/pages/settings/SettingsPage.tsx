import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  Shield,
  ScanFace,
  MapPin,
  FileText,
  HelpCircle,
  LogOut,
  Trash2,
  ChevronRight,
  Mail,
  Camera,
} from 'lucide-react'
import useSWR from 'swr'
import {
  deleteAccount,
  syncDeviceTimezone,
  updateEmail,
  updatePublicProfile,
  updatePreferences,
  getApiErrorMessage,
  type AuthUser,
} from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError, toastSuccess } from '../../lib/toast'
import { scheduleStreakNotifications } from '../../lib/streakNotifications'
import { getNotificationPrefs, saveLocalStreakPref } from '../../lib/userPreferences'
import { stopLocationSharing } from '../../lib/locationSharing'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import ThemeSwitcher from '../../components/ThemeSwitcher'

interface LocalSettings {
  notifyStreak: boolean
  notifyFriends: boolean
  notifyMeet: boolean
  geoOnPhotos: boolean
}

interface Props {
  user: AuthUser
  onUserUpdate?: (user: AuthUser) => void
}

function SettingsRow({
  icon: Icon,
  label,
  description,
  children,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  description?: string
  children?: React.ReactNode
  onClick?: () => void
}) {
  const content = (
    <div className="flex items-center justify-between gap-4 py-4 px-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shrink-0">
          <Icon size={18} className="text-[var(--color-on-surface-variant)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[var(--color-on-surface)] font-medium text-sm">{label}</p>
          {description && (
            <p className="text-[var(--color-on-surface-variant)] text-xs mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </div>
      {children ??
        (onClick ? (
          <ChevronRight size={18} className="text-[var(--color-on-surface-variant)] shrink-0" />
        ) : null)}
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left hover:bg-white/5 transition active:scale-[0.99]"
      >
        {content}
      </button>
    )
  }
  return content
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition shrink-0 ${on ? 'bg-[var(--color-brand-primary)]' : 'bg-[var(--color-surface-container-highest)]'}`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-2 px-1">
        {title}
      </h3>
      <div className="glass-card rounded-3xl overflow-hidden divide-y divide-subtle">
        {children}
      </div>
    </div>
  )
}

export default function SettingsPage({ user: initialUser, onUserUpdate }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me, mutate } = useSWR<AuthUser & { timezone?: string }>(SWR_KEYS.me)
  const [local, setLocal] = useState<LocalSettings>(() => {
    const prefs = getNotificationPrefs()
    return {
      notifyStreak: prefs.notifyStreak,
      notifyFriends: prefs.notifyFriends,
      notifyMeet: prefs.notifyMeet,
      geoOnPhotos: prefs.geoOnPhotos,
    }
  })

  useEffect(() => {
    syncDeviceTimezone()
      .then((tz) => {
        mutate({ ...(me ?? initialUser), timezone: tz } as AuthUser & { timezone: string }, false)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function updateLocal(patch: Partial<LocalSettings>) {
    const next = { ...local, ...patch }
    setLocal(next)

    if ('notifyStreak' in patch) {
      saveLocalStreakPref(next.notifyStreak)
      void scheduleStreakNotifications()
    }

    const serverPatch: Parameters<typeof updatePreferences>[0] = {}
    if ('notifyFriends' in patch) serverPatch.notifyFriends = patch.notifyFriends
    if ('notifyMeet' in patch) serverPatch.notifyMeet = patch.notifyMeet
    if ('geoOnPhotos' in patch) serverPatch.geoOnPhotos = patch.geoOnPhotos

    if (Object.keys(serverPatch).length > 0) {
      try {
        const { data: updated } = await updatePreferences(serverPatch)
        const merged = { ...(me ?? initialUser), ...updated }
        mutate(merged, false)
        onUserUpdate?.(merged)
        localStorage.setItem('user', JSON.stringify(merged))
      } catch (e) {
        toastError(getApiErrorMessage(e, t('settings.prefsUpdateFailed')))
        setLocal(local)
      }
    }
  }

  async function handleLogout() {
    if (!confirm(t('settings.logoutConfirm'))) return
    await stopLocationSharing().catch(() => {})
    localStorage.clear()
    window.location.href = '/login'
  }

  async function handleDeleteAccount() {
    if (!confirm(t('settings.deleteConfirm'))) {
      return
    }
    try {
      await deleteAccount()
      await stopLocationSharing().catch(() => {})
      localStorage.clear()
      window.location.href = '/login'
    } catch (e) {
      toastError(getApiErrorMessage(e, t('settings.deleteFailed')))
    }
  }

  const email = me?.email ?? initialUser.email
  const faceEnrolled = me?.faceEnrolled ?? initialUser.faceEnrolled
  const isPublic = me?.isPublic ?? initialUser.isPublic ?? true

  async function handleTogglePublic(v: boolean) {
    try {
      const { data: updated } = await updatePublicProfile(v)
      const next = { ...(me ?? initialUser), ...updated }
      mutate(next, false)
      onUserUpdate?.(next)
    } catch (e) {
      toastError(getApiErrorMessage(e, t('settings.profileUpdateFailed')))
    }
  }

  async function handleChangeEmail() {
    const newEmail = prompt(t('settings.newEmailPrompt'), email)
    if (!newEmail || newEmail === email) return
    if (!newEmail.includes('@')) {
      toastError(t('settings.invalidEmail'))
      return
    }
    try {
      const { data: updated } = await updateEmail(newEmail)
      const next = { ...(me ?? initialUser), ...updated }
      mutate(next, false)
      onUserUpdate?.(next)
      toastSuccess(t('settings.emailChanged'))
    } catch (e) {
      toastError(getApiErrorMessage(e, t('settings.emailChangeFailed')))
    }
  }

  return (
    <div className="flex flex-col px-6 pt-12 pb-8 min-h-screen">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/profile')}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-on-surface transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold text-[var(--color-on-surface)] tracking-tight">
          {t('settings.title')}
        </h1>
      </div>

      <Section title={t('settings.account')}>
        <ThemeSwitcher />
        <LanguageSwitcher />
        <SettingsRow icon={Mail} label="Email" description={email} onClick={handleChangeEmail} />
        <SettingsRow
          icon={Camera}
          label={t('settings.profilePhoto')}
          description={t('settings.changeAvatar')}
          onClick={() => navigate('/profile', { state: { openAvatarSheet: true } })}
        />
        <SettingsRow
          icon={ScanFace}
          label={t('face.faceRecognition')}
          description={faceEnrolled ? t('face.registered') : t('face.notConfigured')}
          onClick={() => navigate('/face-enrollment')}
        />
      </Section>

      <Section title={t('settings.notifications')}>
        <SettingsRow icon={Bell} label={t('settings.streakReminders')}>
          <Toggle on={local.notifyStreak} onChange={(v) => void updateLocal({ notifyStreak: v })} />
        </SettingsRow>
        <SettingsRow icon={Bell} label={t('settings.friends')}>
          <Toggle
            on={local.notifyFriends}
            onChange={(v) => void updateLocal({ notifyFriends: v })}
          />
        </SettingsRow>
        <SettingsRow icon={Bell} label={t('settings.meets')}>
          <Toggle on={local.notifyMeet} onChange={(v) => void updateLocal({ notifyMeet: v })} />
        </SettingsRow>
      </Section>

      <Section title={t('settings.privacy')}>
        <SettingsRow icon={Shield} label={t('settings.publicProfile')}>
          <Toggle on={isPublic} onChange={handleTogglePublic} />
        </SettingsRow>
        <SettingsRow icon={MapPin} label={t('settings.geoOnPhotos')}>
          <Toggle on={local.geoOnPhotos} onChange={(v) => void updateLocal({ geoOnPhotos: v })} />
        </SettingsRow>
      </Section>

      <Section title={t('settings.about')}>
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
          <span className="text-[var(--color-on-surface-variant)] text-xs">{t('app.version')}</span>
        </div>
      </Section>

      <Section title={t('settings.account')}>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 py-4 px-4 text-[var(--color-error)] hover:bg-white/5 transition active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center">
            <LogOut size={18} />
          </div>
          <span className="font-semibold text-sm">{t('settings.signOut')}</span>
        </button>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="w-full flex items-center gap-3 py-4 px-4 text-[var(--color-on-surface-variant)] hover:bg-white/5 transition border-t border-subtle active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
            <Trash2 size={18} />
          </div>
          <span className="font-medium text-sm">{t('settings.deleteAccount')}</span>
        </button>
      </Section>
    </div>
  )
}

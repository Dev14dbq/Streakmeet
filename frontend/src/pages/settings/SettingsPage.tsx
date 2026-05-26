import { useState, useEffect } from 'react'
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
  fetcher,
  deleteAccount,
  syncDeviceTimezone,
  updateEmail,
  updatePublicProfile,
  type AuthUser,
} from '../../lib/api'
import { toastError, toastInfo, toastSuccess } from '../../lib/toast'
import { scheduleStreakNotifications } from '../../lib/streakNotifications'
import { stopLocationSharing } from '../../lib/locationSharing'

const SETTINGS_KEY = 'streakmeet_settings'

interface LocalSettings {
  notifyStreak: boolean
  notifyFriends: boolean
  notifyMeet: boolean
  geoOnPhotos: boolean
}

const defaultLocal: LocalSettings = {
  notifyStreak: true,
  notifyFriends: true,
  notifyMeet: true,
  geoOnPhotos: true,
}

function loadLocalSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...defaultLocal, ...JSON.parse(raw) } : defaultLocal
  } catch {
    return defaultLocal
  }
}

function saveLocalSettings(s: LocalSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
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
          <p className="text-white font-medium text-sm">{label}</p>
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
      <div className="glass-card rounded-3xl overflow-hidden divide-y divide-white/5">
        {children}
      </div>
    </div>
  )
}

export default function SettingsPage({ user: initialUser }: Props) {
  const navigate = useNavigate()
  const { data: me, mutate } = useSWR<AuthUser & { timezone?: string }>('/api/users/me', fetcher)
  const [local, setLocal] = useState<LocalSettings>(loadLocalSettings)

  useEffect(() => {
    syncDeviceTimezone()
      .then((tz) => {
        mutate({ ...(me ?? initialUser), timezone: tz } as AuthUser & { timezone: string }, false)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateLocal(patch: Partial<LocalSettings>) {
    const next = { ...local, ...patch }
    setLocal(next)
    saveLocalSettings(next)
    if ('notifyStreak' in patch) {
      void scheduleStreakNotifications()
    }
  }

  async function handleLogout() {
    if (!confirm('Выйти из аккаунта?')) return
    await stopLocationSharing().catch(() => {})
    localStorage.clear()
    window.location.href = '/login'
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        'Удалить аккаунт?\n\nДанные будут храниться ещё 30 дней. За это время вы сможете восстановить аккаунт, просто войдя снова.'
      )
    ) {
      return
    }
    try {
      await deleteAccount()
      await stopLocationSharing().catch(() => {})
      localStorage.clear()
      window.location.href = '/login'
    } catch {
      toastError('Не удалось удалить аккаунт')
    }
  }

  const email = me?.email ?? initialUser.email
  const faceEnrolled = me?.faceEnrolled ?? initialUser.faceEnrolled
  const isPublic = me?.isPublic ?? initialUser.isPublic ?? true

  async function handleTogglePublic(v: boolean) {
    try {
      const { data: updated } = await updatePublicProfile(v)
      mutate({ ...(me ?? initialUser), ...updated }, false)
    } catch {
      toastError('Не удалось обновить настройки профиля')
    }
  }

  async function handleChangeEmail() {
    const newEmail = prompt('Введите новый email:', email)
    if (!newEmail || newEmail === email) return
    if (!newEmail.includes('@')) {
      toastError('Некорректный email')
      return
    }
    try {
      const { data: updated } = await updateEmail(newEmail)
      mutate({ ...(me ?? initialUser), ...updated }, false)
      toastSuccess('Email успешно изменён')
    } catch (e: any) {
      toastError(e.response?.data?.error || 'Не удалось изменить email')
    }
  }

  return (
    <div className="flex flex-col px-6 pt-12 pb-8 min-h-screen">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/profile')}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-white transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Настройки</h1>
      </div>

      <Section title="Аккаунт">
        <SettingsRow icon={Mail} label="Email" description={email} onClick={handleChangeEmail} />
        <SettingsRow
          icon={Camera}
          label="Фото профиля"
          description="Изменить аватар"
          onClick={() => navigate('/profile', { state: { openAvatarSheet: true } })}
        />
        <SettingsRow
          icon={ScanFace}
          label="Распознавание лица"
          description={faceEnrolled ? 'Зарегистрировано' : 'Не настроено — нужно для встреч'}
          onClick={() => navigate('/face-enrollment')}
        />
      </Section>

      <Section title="Уведомления">
        <SettingsRow
          icon={Bell}
          label="Напоминания о серии"
          description="Утро и вечер, если серия горит"
        >
          <Toggle on={local.notifyStreak} onChange={(v) => updateLocal({ notifyStreak: v })} />
        </SettingsRow>
        <SettingsRow icon={Bell} label="Друзья" description="Заявки и принятие">
          <Toggle on={local.notifyFriends} onChange={(v) => updateLocal({ notifyFriends: v })} />
        </SettingsRow>
        <SettingsRow icon={Bell} label="Встречи" description="Серия продлена, друг на фото">
          <Toggle on={local.notifyMeet} onChange={(v) => updateLocal({ notifyMeet: v })} />
        </SettingsRow>
        <p className="text-[10px] text-[var(--color-on-surface-variant)] px-1 mt-2 opacity-70">
          На телефоне — push в 23:00, 23:30 и после полуночи, если серия не продлена.
        </p>
      </Section>

      <Section title="Конфиденциальность">
        <SettingsRow icon={Shield} label="Публичный профиль" description="Доступ к фото по ссылке">
          <Toggle on={isPublic} onChange={handleTogglePublic} />
        </SettingsRow>
        <SettingsRow icon={MapPin} label="Геолокация на фото" description="Сохранять место встречи">
          <Toggle on={local.geoOnPhotos} onChange={(v) => updateLocal({ geoOnPhotos: v })} />
        </SettingsRow>
        <SettingsRow
          icon={Shield}
          label="Биометрические данные"
          description="Используются только для проверки встреч"
        />
      </Section>

      <Section title="О приложении">
        <SettingsRow
          icon={FileText}
          label="Условия использования"
          onClick={() => navigate('/terms')}
        />
        <SettingsRow
          icon={Shield}
          label="Политика конфиденциальности"
          onClick={() => navigate('/privacy')}
        />
        <SettingsRow
          icon={HelpCircle}
          label="Поддержка"
          description="support@streakmeet.app"
          onClick={() => toastInfo('Скоро')}
        />
        <div className="px-4 py-3 text-center">
          <span className="text-[var(--color-on-surface-variant)] text-xs">
            StreakMeet · v0.1.0
          </span>
        </div>
      </Section>

      <Section title="Аккаунт">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 py-4 px-4 text-[var(--color-error)] hover:bg-white/5 transition active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center">
            <LogOut size={18} />
          </div>
          <span className="font-semibold text-sm">Выйти</span>
        </button>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="w-full flex items-center gap-3 py-4 px-4 text-[var(--color-on-surface-variant)] hover:bg-white/5 transition border-t border-white/5 active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
            <Trash2 size={18} />
          </div>
          <span className="font-medium text-sm">Удалить аккаунт</span>
        </button>
      </Section>
    </div>
  )
}

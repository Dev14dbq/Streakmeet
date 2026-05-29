import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { Bell } from 'lucide-react'
import { getApiErrorMessage, type AuthUser } from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError } from '../../lib/toast'
import { SettingsPageShell, SettingsRow, SettingsSection, SettingsToggle } from './settingsUi'
import { readLocalSettings, saveSettingsPatch, type LocalSettings } from './settingsPrefs'

interface Props {
  user: AuthUser
  onUserUpdate?: (user: AuthUser) => void
}

export default function NotificationSettingsPage({ user, onUserUpdate }: Props) {
  const { t } = useTranslation()
  const { mutate } = useSWR<AuthUser>(SWR_KEYS.me)
  const [local, setLocal] = useState<LocalSettings>(() => readLocalSettings())

  async function updateLocal(patch: Partial<LocalSettings>) {
    const previous = local
    const next = { ...local, ...patch }
    setLocal(next)

    try {
      const updated = await saveSettingsPatch(previous, patch)
      if (updated) {
        const merged = { ...user, ...updated }
        mutate(merged, false)
        onUserUpdate?.(merged)
      }
    } catch (e) {
      setLocal(previous)
      toastError(getApiErrorMessage(e, t('settings.prefsUpdateFailed')))
    }
  }

  return (
    <SettingsPageShell
      title={t('settings.notifications')}
      subtitle={t('settings.notificationsIntro')}
      backLabel={t('common.back')}
    >
      <SettingsSection title={t('settings.notifications')}>
        <SettingsRow
          icon={Bell}
          label={t('settings.streakReminders')}
          description={t('settings.streakRemindersDesc')}
        >
          <SettingsToggle
            on={local.notifyStreak}
            onChange={(v) => void updateLocal({ notifyStreak: v })}
            label={t('settings.streakReminders')}
          />
        </SettingsRow>
        <SettingsRow
          icon={Bell}
          label={t('settings.friends')}
          description={t('settings.friendsDesc')}
        >
          <SettingsToggle
            on={local.notifyFriends}
            onChange={(v) => void updateLocal({ notifyFriends: v })}
            label={t('settings.friends')}
          />
        </SettingsRow>
        <SettingsRow icon={Bell} label={t('settings.meets')} description={t('settings.meetsDesc')}>
          <SettingsToggle
            on={local.notifyMeet}
            onChange={(v) => void updateLocal({ notifyMeet: v })}
            label={t('settings.meets')}
          />
        </SettingsRow>
      </SettingsSection>
      <p className="px-2 text-xs leading-relaxed text-[var(--color-on-surface-variant)]">
        {t('settings.pushHint')}
      </p>
    </SettingsPageShell>
  )
}

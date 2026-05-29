import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { Lock, Mail, MapPin, Shield } from 'lucide-react'
import { getApiErrorMessage, updatePublicProfile, type AuthUser } from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError } from '../../lib/toast'
import { SettingsPageShell, SettingsRow, SettingsSection, SettingsToggle } from './settingsUi'
import { readLocalSettings, saveSettingsPatch, type LocalSettings } from './settingsPrefs'

interface Props {
  user: AuthUser
  onUserUpdate?: (user: AuthUser) => void
}

export default function PrivacySettingsPage({ user, onUserUpdate }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me, mutate } = useSWR<AuthUser>(SWR_KEYS.me)
  const [local, setLocal] = useState<LocalSettings>(() => readLocalSettings())
  const currentUser = me ?? user
  const isPublic = currentUser.isPublic ?? true

  async function handleTogglePublic(v: boolean) {
    try {
      const { data: updated } = await updatePublicProfile(v)
      const next = { ...currentUser, ...updated }
      mutate(next, false)
      onUserUpdate?.(next)
    } catch (e) {
      toastError(getApiErrorMessage(e, t('settings.profileUpdateFailed')))
    }
  }

  async function handleToggleGeo(v: boolean) {
    const previous = local
    setLocal({ ...local, geoOnPhotos: v })
    try {
      const updated = await saveSettingsPatch(previous, { geoOnPhotos: v })
      if (updated) {
        const next = { ...currentUser, ...updated }
        mutate(next, false)
        onUserUpdate?.(next)
      }
    } catch (e) {
      setLocal(previous)
      toastError(getApiErrorMessage(e, t('settings.prefsUpdateFailed')))
    }
  }

  return (
    <SettingsPageShell
      title={t('settings.privacy')}
      subtitle={t('settings.privacyIntro')}
      backLabel={t('common.back')}
    >
      <SettingsSection title={t('settings.visibility')}>
        <SettingsRow
          icon={Shield}
          label={t('settings.publicProfile')}
          description={t('settings.publicProfileDesc')}
        >
          <SettingsToggle
            on={isPublic}
            onChange={handleTogglePublic}
            label={t('settings.publicProfile')}
          />
        </SettingsRow>
        <SettingsRow
          icon={MapPin}
          label={t('settings.geoOnPhotos')}
          description={t('settings.geoOnPhotosDesc')}
        >
          <SettingsToggle
            on={local.geoOnPhotos}
            onChange={(v) => void handleToggleGeo(v)}
            label={t('settings.geoOnPhotos')}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t('settings.security')}>
        <SettingsRow
          icon={Mail}
          label={t('settings.changeEmail')}
          description={currentUser.email}
          onClick={() => navigate('/settings/email')}
        />
        <SettingsRow
          icon={Lock}
          label={t('settings.changePassword')}
          description={t('settings.changePasswordDesc')}
          onClick={() => navigate('/settings/password')}
        />
      </SettingsSection>
    </SettingsPageShell>
  )
}

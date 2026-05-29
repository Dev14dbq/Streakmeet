import type { AuthUser } from '../../lib/api'
import { updatePreferences } from '../../lib/api'
import { scheduleStreakNotifications } from '../../lib/streakNotifications'
import { getNotificationPrefs, saveLocalStreakPref } from '../../lib/userPreferences'

export interface LocalSettings {
  notifyStreak: boolean
  notifyFriends: boolean
  notifyMeet: boolean
  geoOnPhotos: boolean
}

export function readLocalSettings(): LocalSettings {
  const prefs = getNotificationPrefs()
  return {
    notifyStreak: prefs.notifyStreak,
    notifyFriends: prefs.notifyFriends,
    notifyMeet: prefs.notifyMeet,
    geoOnPhotos: prefs.geoOnPhotos,
  }
}

export async function saveSettingsPatch(
  current: LocalSettings,
  patch: Partial<LocalSettings>
): Promise<AuthUser | null> {
  const next = { ...current, ...patch }

  if ('notifyStreak' in patch) {
    saveLocalStreakPref(next.notifyStreak)
    void scheduleStreakNotifications()
  }

  const serverPatch: Parameters<typeof updatePreferences>[0] = {}
  if ('notifyFriends' in patch) serverPatch.notifyFriends = patch.notifyFriends
  if ('notifyMeet' in patch) serverPatch.notifyMeet = patch.notifyMeet
  if ('geoOnPhotos' in patch) serverPatch.geoOnPhotos = patch.geoOnPhotos

  if (Object.keys(serverPatch).length === 0) return null

  const { data } = await updatePreferences(serverPatch)
  localStorage.setItem('user', JSON.stringify(data))
  return data
}

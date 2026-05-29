const SETTINGS_KEY = 'streakmeet_settings'

export interface NotificationPrefs {
  notifyStreak: boolean
  notifyFriends: boolean
  notifyMeet: boolean
  geoOnPhotos: boolean
}

const defaults: NotificationPrefs = {
  notifyStreak: true,
  notifyFriends: true,
  notifyMeet: true,
  geoOnPhotos: true,
}

function fromStoredUser(): Partial<NotificationPrefs> {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}') as {
      notifyFriends?: boolean
      notifyMeet?: boolean
      geoOnPhotos?: boolean
    }
    return {
      notifyFriends: user.notifyFriends,
      notifyMeet: user.notifyMeet,
      geoOnPhotos: user.geoOnPhotos,
    }
  } catch {
    return {}
  }
}

function fromLocalSettings(): Partial<NotificationPrefs> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<NotificationPrefs>
  } catch {
    return {}
  }
}

export function getNotificationPrefs(): NotificationPrefs {
  const merged = { ...defaults, ...fromStoredUser(), ...fromLocalSettings() }
  return {
    notifyStreak: merged.notifyStreak !== false,
    notifyFriends: merged.notifyFriends !== false,
    notifyMeet: merged.notifyMeet !== false,
    geoOnPhotos: merged.geoOnPhotos !== false,
  }
}

export function saveLocalStreakPref(notifyStreak: boolean): void {
  const current = fromLocalSettings()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaults, ...current, notifyStreak }))
}

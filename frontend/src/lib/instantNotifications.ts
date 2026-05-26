import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { ensureNotificationPermission, NOTIFICATION_CHANNEL_ID } from './streakNotifications'
import { translateNotification } from './translateNotification'

const SETTINGS_KEY = 'streakmeet_settings'

export interface AppNotificationPayload {
  message: string
  route?: string
  type?: string
  params?: Record<string, string>
}

let nextInstantId = 950_000

function settingEnabled(key: 'notifyFriends' | 'notifyMeet'): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    return JSON.parse(raw)[key] !== false
  } catch {
    return true
  }
}

function allowsInstantPush(data: AppNotificationPayload): boolean {
  switch (data.type) {
    case 'friend_request':
    case 'friend_accepted':
      return settingEnabled('notifyFriends')
    case 'meet':
    case 'meet_extended':
    case 'meet_photo_added':
    case 'streak_remind':
    case 'remote_selfie_request':
    case 'remote_selfie_completed':
      return settingEnabled('notifyMeet')
    default:
      return true
  }
}

function takeInstantNotificationId(): number {
  nextInstantId += 1
  if (nextInstantId >= 999_999) nextInstantId = 950_000
  return nextInstantId
}

export async function showInstantPushNotification(data: AppNotificationPayload): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!allowsInstantPush(data)) return

  const granted = await ensureNotificationPermission()
  if (!granted) return

  await LocalNotifications.schedule({
    notifications: [
      {
        id: takeInstantNotificationId(),
        title: 'StreakMeet',
        body: translateNotification(data),
        schedule: { at: new Date(Date.now() + 100) },
        channelId: NOTIFICATION_CHANNEL_ID,
        extra: { route: data.route ?? '/' },
        sound: 'default',
        iconColor: '#FF1A4F',
      },
    ],
  })
}

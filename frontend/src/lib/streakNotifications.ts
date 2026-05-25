import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getStreaks } from './api'
import {
  addDaysToDateString,
  getDeviceTimezone,
  getLocalToday,
  localTimeInZoneToDate,
} from './timezone'

const SETTINGS_KEY = 'streakmeet_settings'

interface StreakRow {
  id: string
  count: number
  lastMetDate?: string
  partner: { nickname: string }
}

function streakNotificationsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    return JSON.parse(raw).notifyStreak !== false
  } catch {
    return true
  }
}

function notificationId(streakId: string, kind: string): number {
  let h = 0
  const key = `${streakId}:${kind}`
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return (Math.abs(h) % 900_000) + 10_000
}

export function isNativeNotificationsPlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  const requested = await LocalNotifications.requestPermissions()
  return requested.display === 'granted'
}

export async function cancelStreakNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const pending = await LocalNotifications.getPending()
  const toCancel = pending.notifications
    .filter((n) => n.id >= 10_000 && n.id < 910_000)
    .map((n) => ({ id: n.id }))
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: toCancel })
  }
}

export async function scheduleStreakNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  if (!streakNotificationsEnabled()) {
    await cancelStreakNotifications()
    return
  }

  const granted = await ensureNotificationPermission()
  if (!granted) return

  const tz = getDeviceTimezone()
  const today = getLocalToday(tz)
  const tomorrow = addDaysToDateString(today, 1)
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = tomorrow.split('-').map(Number) as [number, number, number]

  const { data: streaks } = await getStreaks()
  const pending = (streaks as StreakRow[]).filter((s) => s.count > 0 && s.lastMetDate !== today)

  await cancelStreakNotifications()

  const now = Date.now()
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = []

  for (const streak of pending) {
    const route = `/streaks/${streak.partner.nickname}`
    const partner = streak.partner.nickname

    const slots = [
      {
        kind: '1h',
        at: localTimeInZoneToDate(y, m, d, 23, 0, tz),
        body: `Серия с @${partner} сгорит через час!`,
      },
      {
        kind: '30m',
        at: localTimeInZoneToDate(y, m, d, 23, 30, tz),
        body: `Серия с @${partner} сгорит через 30 минут!`,
      },
      {
        kind: 'burn',
        at: localTimeInZoneToDate(y2, m2, d2, 0, 5, tz),
        body: `Серия с @${partner} сгорела 🔥`,
      },
    ]

    for (const slot of slots) {
      if (slot.at.getTime() <= now) continue
      notifications.push({
        id: notificationId(streak.id, slot.kind),
        title: 'StreakMeet',
        body: slot.body,
        schedule: { at: slot.at },
        extra: { route },
        sound: 'default',
        iconColor: '#FF1A4F',
      })
    }
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications })
  }
}

export function registerNotificationTapHandler(onNavigate: (route: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}

  const sub = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const route = event.notification.extra?.route
    if (typeof route === 'string') onNavigate(route)
  })

  return () => {
    void sub.then((h) => h.remove())
  }
}

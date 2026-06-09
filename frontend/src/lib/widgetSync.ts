import { Capacitor, registerPlugin } from '@capacitor/core'
import type { StreakListItem } from '@streakmeet/api-spec'
import { isStreakMetToday } from './streakCalendar'

interface StreakWidgetPlugin {
  updateSnapshot(options: { pendingToday: number; longestStreak: number }): Promise<void>
  clearSnapshot(): Promise<void>
}

const StreakWidget = registerPlugin<StreakWidgetPlugin>('StreakWidget')

function computeWidgetStats(streaks: StreakListItem[]): {
  pendingToday: number
  longestStreak: number
} {
  const pendingToday = streaks.filter((s) => s.count > 0 && !isStreakMetToday(s)).length
  const longestStreak = streaks.reduce((max, s) => Math.max(max, s.count), 0)
  return { pendingToday, longestStreak }
}

export async function syncStreakWidget(streaks: StreakListItem[]): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  const { pendingToday, longestStreak } = computeWidgetStats(streaks)
  await StreakWidget.updateSnapshot({ pendingToday, longestStreak })
}

export async function clearStreakWidget(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  await StreakWidget.clearSnapshot()
}

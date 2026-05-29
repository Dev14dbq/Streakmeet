import type { AuthUser } from '@streakmeet/api-spec'
import type { PhotoData } from '../components/PhotoViewerModal'
import type { MemoryFeedItem, MemoryMeetItem } from './api/memories'

export function monthKey(date: string) {
  return date.slice(0, 7)
}

export function dedupeFeedItems(items: MemoryFeedItem[]): MemoryFeedItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function groupFeedByMonth(items: MemoryFeedItem[]) {
  const monthMap = new Map<string, Map<string, MemoryFeedItem[]>>()

  for (const item of items) {
    const month = monthKey(item.date)
    const dayMap = monthMap.get(month) ?? new Map<string, MemoryFeedItem[]>()
    const dayItems = dayMap.get(item.date) ?? []
    dayItems.push(item)
    dayMap.set(item.date, dayItems)
    monthMap.set(month, dayMap)
  }

  return [...monthMap.entries()].map(
    ([month, dayMap]) =>
      [month, [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))] as const
  )
}

export function memoryMeetToPhotoData(item: MemoryMeetItem, me: AuthUser): PhotoData {
  const isPartnerA = me.id !== item.partner.id
  return {
    id: item.id,
    photoUrl: item.photoUrl,
    latitude: item.latitude,
    longitude: item.longitude,
    createdAt: item.createdAt,
    uploadedBy: item.uploadedBy,
    streakDay: {
      streak: {
        userA: isPartnerA
          ? { id: me.id, nickname: me.nickname }
          : { id: item.partner.id, nickname: item.partner.nickname },
        userB: isPartnerA
          ? { id: item.partner.id, nickname: item.partner.nickname }
          : { id: me.id, nickname: me.nickname },
      },
    },
  }
}

export function unlockProgress(unlockAtDays: number, daysUntilUnlock: number) {
  if (unlockAtDays <= 0) return 0
  const completed = Math.max(0, unlockAtDays - daysUntilUnlock)
  return Math.min(100, Math.round((completed / unlockAtDays) * 100))
}

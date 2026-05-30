import { apiClientForPath } from './migratedClient'

export type MemoryPartner = {
  id: string
  nickname: string
  avatarUrl: string | null
}

export type MemoryMeetItem = {
  id: string
  kind: 'meet'
  date: string
  createdAt: string
  streakId: string
  partner: MemoryPartner
  photoUrl: string
  uploadedBy: { id: string; nickname: string }
  latitude: number | null
  longitude: number | null
}

export type MemoryMilestoneItem = {
  id: string
  kind: 'milestone'
  date: string
  streakId: string
  partner: MemoryPartner
  milestoneDays: number
}

export type MemoryFeedItem = MemoryMeetItem | MemoryMilestoneItem

export type MemoriesFeedResponse = {
  unlocked: boolean
  daysUntilUnlock: number
  unlockAtDays: number
  page: number
  limit: number
  hasMore: boolean
  milestones: MemoryMilestoneItem[]
  items: MemoryFeedItem[]
}

export function getMemories(page = 1, limit = 20, streakId?: string) {
  return apiClientForPath('/api/memories/').get<MemoriesFeedResponse>('/api/memories/', {
    params: { page, limit, streakId },
  })
}

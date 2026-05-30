/** Minimum MET streak days before the memories feed unlocks. */
export const MEMORIES_UNLOCK_DAYS = 7

/** Streak length milestones shown as cards in the feed. */
export const MEMORIES_MILESTONE_DAYS = [7, 14, 30, 50, 100] as const

export type MemoryMilestoneDay = (typeof MEMORIES_MILESTONE_DAYS)[number]

import { computeMilestonesFromMetDays } from './milestones.js'
import {
  countMetDaysForUser,
  listMeetProofsForUser,
  listMetDaysForUser,
  loadPartnerByStreakId,
  maxActiveStreakCount,
  partnerFromProof,
  type MeetProofRow,
} from './repository.js'
import { findStreakForUser } from '../streaks/service.js'

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

function mapMeetItem(userId: string, proof: MeetProofRow): MemoryMeetItem {
  const partner = partnerFromProof(userId, proof)
  return {
    id: proof.id,
    kind: 'meet',
    date: proof.streakDay.date,
    createdAt: proof.createdAt.toISOString(),
    streakId: proof.streakDay.streakId,
    partner: {
      id: partner.id,
      nickname: partner.nickname,
      avatarUrl: partner.avatarUrl,
    },
    photoUrl: proof.photoUrl,
    uploadedBy: proof.uploadedBy,
    latitude: proof.latitude,
    longitude: proof.longitude,
  }
}

function milestoneId(streakId: string, days: number, date: string): string {
  return `milestone:${streakId}:${days}:${date}`
}

function sortFeedItems(a: MemoryFeedItem, b: MemoryFeedItem): number {
  const dateCompare = b.date.localeCompare(a.date)
  if (dateCompare !== 0) return dateCompare
  if (a.kind === 'meet' && b.kind === 'meet') {
    return b.createdAt.localeCompare(a.createdAt)
  }
  if (a.kind === 'milestone' && b.kind === 'milestone') {
    return b.milestoneDays - a.milestoneDays
  }
  return a.kind === 'milestone' ? 1 : -1
}

function mapMilestones(
  computed: ReturnType<typeof computeMilestonesFromMetDays>,
  partners: Map<string, MemoryPartner>
): MemoryMilestoneItem[] {
  return computed.flatMap((milestone) => {
    const partner = partners.get(milestone.streakId)
    if (!partner) return []

    return [
      {
        id: milestoneId(milestone.streakId, milestone.days, milestone.date),
        kind: 'milestone' as const,
        date: milestone.date,
        streakId: milestone.streakId,
        partner,
        milestoneDays: milestone.days,
      },
    ]
  })
}

async function resolveUnlockStatus(userId: string) {
  const [metDaysCount, bestActiveCount] = await Promise.all([
    countMetDaysForUser(userId),
    maxActiveStreakCount(userId),
  ])

  const unlocked = metDaysCount >= MEMORIES_UNLOCK_DAYS
  const daysUntilUnlock = unlocked ? 0 : Math.max(0, MEMORIES_UNLOCK_DAYS - bestActiveCount)

  return { unlocked, daysUntilUnlock }
}

export async function getMemoriesFeed(
  userId: string,
  page: number,
  limit: number,
  streakId?: string
): Promise<MemoriesFeedResponse> {
  if (streakId) {
    await findStreakForUser(streakId, userId)
  }

  const { unlocked, daysUntilUnlock } = await resolveUnlockStatus(userId)

  if (!unlocked) {
    return {
      unlocked: false,
      daysUntilUnlock,
      unlockAtDays: MEMORIES_UNLOCK_DAYS,
      page,
      limit,
      hasMore: false,
      milestones: [],
      items: [],
    }
  }

  const fetchLimit = limit + 1
  const [proofs, metDays, partners] = await Promise.all([
    listMeetProofsForUser(userId, page, fetchLimit, { streakId }),
    listMetDaysForUser(userId, streakId),
    loadPartnerByStreakId(userId, streakId),
  ])

  const hasMore = proofs.length > limit
  const pageProofs = proofs.slice(0, limit)
  const milestones = mapMilestones(computeMilestonesFromMetDays(metDays), partners)
  const meetItems = pageProofs.map((proof) => mapMeetItem(userId, proof))
  const milestoneItems = page === 1 ? milestones : []
  const items = [...milestoneItems, ...meetItems].sort(sortFeedItems)

  return {
    unlocked: true,
    daysUntilUnlock: 0,
    unlockAtDays: MEMORIES_UNLOCK_DAYS,
    page,
    limit,
    hasMore,
    milestones,
    items,
  }
}

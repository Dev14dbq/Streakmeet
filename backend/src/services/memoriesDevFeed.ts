import { prisma } from '../lib/prisma.js'
import { MEMORIES_MILESTONE_DAYS, MEMORIES_UNLOCK_DAYS } from '../lib/memoriesConstants.js'
import { streakForUserWhere } from '../lib/relations.js'
import type { MemoriesFeedResponse, MemoryFeedItem, MemoryPartner } from './memoriesService.js'

const DEV_STREAK_ID = 'dev-streak-memories'
const DEV_PARTNER: MemoryPartner = {
  id: 'dev-partner',
  nickname: 'devfriend',
  avatarUrl: 'https://picsum.photos/seed/streakmeet-avatar/200/200',
}

const TOTAL_DEV_MEETS = 35

function devPhotoUrl(index: number): string {
  return `https://picsum.photos/seed/streakmeet-meet-${index}/600/800`
}

function formatDateOffset(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function buildDevMilestones(partner: MemoryPartner): MemoriesFeedResponse['milestones'] {
  return MEMORIES_MILESTONE_DAYS.slice(0, 3).map((days) => {
    const date = formatDateOffset(days)
    return {
      id: `milestone:${DEV_STREAK_ID}:${days}:${date}`,
      kind: 'milestone' as const,
      date,
      streakId: DEV_STREAK_ID,
      partner,
      milestoneDays: days,
    }
  })
}

function buildDevMeetItems(
  userId: string,
  userNickname: string,
  partner: MemoryPartner
): Extract<MemoryFeedItem, { kind: 'meet' }>[] {
  return Array.from({ length: TOTAL_DEV_MEETS }, (_, index) => {
    const daysAgo = index + 1
    const date = formatDateOffset(daysAgo)
    const createdAt = new Date(`${date}T12:00:00.000Z`).toISOString()

    return {
      id: `dev-meet-${index + 1}`,
      kind: 'meet' as const,
      date,
      createdAt,
      streakId: DEV_STREAK_ID,
      partner,
      photoUrl: devPhotoUrl(index + 1),
      uploadedBy: {
        id: index % 2 === 0 ? userId : partner.id,
        nickname: index % 2 === 0 ? userNickname : partner.nickname,
      },
      latitude: index % 3 === 0 ? 55.7558 : null,
      longitude: index % 3 === 0 ? 37.6173 : null,
    }
  })
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

async function resolveDevPartner(userId: string) {
  const streak = await prisma.streak.findFirst({
    where: { active: true, ...streakForUserWhere(userId) },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })

  if (!streak) return { streakId: DEV_STREAK_ID, partner: DEV_PARTNER }

  const partner = streak.userAId === userId ? streak.userB : streak.userA

  return {
    streakId: streak.id,
    partner: {
      id: partner.id,
      nickname: partner.nickname,
      avatarUrl: partner.avatarUrl ?? DEV_PARTNER.avatarUrl,
    },
  }
}

/** Placeholder memories feed for local UI testing (MEMORIES_DEV_MODE=true). */
export async function buildDevMemoriesFeed(
  userId: string,
  page: number,
  limit: number
): Promise<MemoriesFeedResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true },
  })
  const userNickname = user?.nickname ?? 'you'
  const { streakId, partner } = await resolveDevPartner(userId)

  const milestones = buildDevMilestones(partner).map((milestone) => ({
    ...milestone,
    streakId,
    id: milestone.id.replace(DEV_STREAK_ID, streakId),
  }))

  const meetItems = buildDevMeetItems(userId, userNickname, partner).map((item) => ({
    ...item,
    streakId,
  }))

  const allItems = [...milestones, ...meetItems].sort(sortFeedItems)
  const start = (page - 1) * limit
  const slice = allItems.slice(start, start + limit)

  return {
    unlocked: true,
    daysUntilUnlock: 0,
    unlockAtDays: MEMORIES_UNLOCK_DAYS,
    page,
    limit,
    hasMore: start + limit < allItems.length,
    milestones,
    items: slice,
  }
}

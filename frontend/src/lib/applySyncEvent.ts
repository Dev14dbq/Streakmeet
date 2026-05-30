import { mutate } from 'swr'
import type { FriendListItem, StreakListItem } from '@streakmeet/api-spec'
import { SWR_KEYS } from './swrKeys'
import type { SyncEnvelope } from '../connect/syncStream'

export interface FriendSyncPayload {
  eventType: string
  friendship: FriendListItem
}

export interface StreakCreatedPayload {
  streak: StreakListItem
}

export interface StreakMeetPayload {
  streakId: string
  count: number
  lastMetDate?: string | null
  partner?: StreakListItem['partner']
}

export interface StreakBurnedPayload {
  streakId: string
  count: number
}

/** Patch SWR caches from a live SyncEnvelope (no refetch). */
export function applySyncEvent(env: SyncEnvelope): void {
  switch (env.payload.case) {
    case 'friendEvent':
      patchFriendsCache(env.payload.value)
      break
    case 'streakCreated':
      patchStreaksCacheInsert(env.payload.value.streak)
      break
    case 'streakMeet':
      patchStreaksCacheMeet(env.payload.value)
      break
    case 'streakBurned':
      patchStreaksCacheBurn(env.payload.value)
      break
    default:
      break
  }
}

function patchFriendsCache(event: FriendSyncPayload): void {
  const { eventType, friendship } = event

  void mutate<FriendListItem[]>(
    SWR_KEYS.friends,
    (current = []) => {
      if (
        eventType === 'friends.rejected' ||
        eventType === 'friends.cancelled' ||
        eventType === 'friends.removed'
      ) {
        return current.filter((f) => f.id !== friendship.id)
      }

      const idx = current.findIndex((f) => f.id === friendship.id)
      if (idx >= 0) {
        const next = [...current]
        next[idx] = friendship
        return next
      }
      return [friendship, ...current]
    },
    { revalidate: false }
  )
}

function patchStreaksCacheInsert(streak: StreakListItem): void {
  void mutate<StreakListItem[]>(
    SWR_KEYS.streaks,
    (current = []) => {
      if (current.some((s) => s.id === streak.id)) {
        return current.map((s) => (s.id === streak.id ? streak : s))
      }
      return [streak, ...current]
    },
    { revalidate: false }
  )
}

function patchStreaksCacheMeet(update: StreakMeetPayload): void {
  void mutate<StreakListItem[]>(
    SWR_KEYS.streaks,
    (current = []) =>
      current.map((s) =>
        s.id === update.streakId
          ? {
              ...s,
              count: update.count,
              lastMetDate: update.lastMetDate ?? s.lastMetDate,
              partner: update.partner ?? s.partner,
            }
          : s
      ),
    { revalidate: false }
  )

  void mutate((key) => typeof key === 'string' && key.startsWith('/api/streaks/'), undefined, {
    revalidate: true,
  })
}

function patchStreaksCacheBurn(update: StreakBurnedPayload): void {
  void mutate<StreakListItem[]>(
    SWR_KEYS.streaks,
    (current = []) =>
      current.map((s) =>
        s.id === update.streakId ? { ...s, count: update.count, lastMetDate: null } : s
      ),
    { revalidate: false }
  )

  void mutate((key) => typeof key === 'string' && key.startsWith('/api/streaks/'), undefined, {
    revalidate: true,
  })
}

import { mutate } from 'swr'
import type { FriendListItem, StreakListItem } from '@streakmeet/api-spec'
import { SWR_KEYS } from './swrKeys'
import type { SyncEnvelope } from './connect/syncStream'
import { invalidateAfterNotification } from './swrInvalidation'

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

export interface LocationUpdatedPayload {
  id: string
  nickname: string
  avatarUrl?: string | null
  latitude: number
  longitude: number
  updatedAt?: string | null
}

export interface LocationRemovedPayload {
  id: string
  removed: true
}

export interface ProfileUpdatedPayload {
  userId: string
  nickname: string
  avatarUrl?: string | null
}

export interface StreakEventPayload {
  eventType: string
  streak: StreakListItem
}

export interface SyncNotificationPayload {
  type: string
  params?: Record<string, string>
  route?: string
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
    case 'streakEvent':
      patchStreakEvent(env.payload.value)
      break
    case 'streakMeet':
      patchStreaksCacheMeet(env.payload.value)
      break
    case 'streakBurned':
      patchStreaksCacheBurn(env.payload.value)
      break
    case 'locationUpdated':
      patchFriendLocationsCache(env.payload.value)
      break
    case 'locationRemoved':
      patchFriendLocationsRemoved(env.payload.value)
      break
    case 'profileUpdated':
      patchProfileCache(env.payload.value)
      break
    case 'notification':
      applySyncNotification(env.payload.value)
      break
    case 'heartbeat':
    case 'unknown':
      break
    default:
      break
  }
}

function patchStreakEvent(event: StreakEventPayload): void {
  const type = event.eventType.toLowerCase()
  if (type.includes('created')) {
    patchStreaksCacheInsert(event.streak)
    return
  }
  if (type.includes('meet') || type.includes('extended') || type.includes('photo')) {
    patchStreaksCacheMeet({
      streakId: event.streak.id,
      count: event.streak.count,
      lastMetDate: event.streak.lastMetDate,
      partner: event.streak.partner,
    })
    return
  }
  if (type.includes('burned')) {
    patchStreaksCacheBurn({ streakId: event.streak.id, count: event.streak.count })
    return
  }
  if (type.includes('remote_selfie')) {
    void mutate((key) => typeof key === 'string' && key.startsWith('/api/streaks/'), undefined, {
      revalidate: true,
    })
    return
  }
  patchStreaksCacheInsert(event.streak)
}

function applySyncNotification(payload: SyncNotificationPayload): void {
  invalidateAfterNotification(payload.type)
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

function patchFriendLocationsCache(update: LocationUpdatedPayload): void {
  void mutate<LocationUpdatedPayload[]>(
    SWR_KEYS.friendLocations,
    (current = []) => {
      const idx = current.findIndex((f) => f.id === update.id)
      const entry = {
        id: update.id,
        nickname: update.nickname,
        avatarUrl: update.avatarUrl ?? null,
        latitude: update.latitude,
        longitude: update.longitude,
        updatedAt: update.updatedAt ?? new Date().toISOString(),
      }
      if (idx >= 0) {
        const next = [...current]
        next[idx] = entry
        return next
      }
      return [...current, entry]
    },
    { revalidate: false }
  )
}

function patchFriendLocationsRemoved(update: LocationRemovedPayload): void {
  void mutate<LocationUpdatedPayload[]>(
    SWR_KEYS.friendLocations,
    (current = []) => current.filter((f) => f.id !== update.id),
    { revalidate: false }
  )
}

function patchProfileCache(update: ProfileUpdatedPayload): void {
  void mutate(SWR_KEYS.friends, (current: FriendListItem[] = []) =>
    current.map((f) =>
      f.friend.id === update.userId
        ? {
            ...f,
            friend: {
              ...f.friend,
              nickname: update.nickname,
              avatarUrl: update.avatarUrl ?? f.friend.avatarUrl,
            },
          }
        : f
    )
  )

  void mutate(SWR_KEYS.streaks, (current: StreakListItem[] = []) =>
    current.map((s) =>
      s.partner.id === update.userId
        ? {
            ...s,
            partner: {
              ...s.partner,
              nickname: update.nickname,
              avatarUrl: update.avatarUrl ?? s.partner.avatarUrl,
            },
          }
        : s
    )
  )
}

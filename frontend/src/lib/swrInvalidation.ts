import { mutate } from 'swr'
import { SWR_KEYS } from './swrKeys'

type CacheGroup =
  | 'friends'
  | 'streaks'
  | 'me'
  | 'location'
  | 'legal'
  | 'photos'
  | 'memories'
  | 'publicProfiles'
  | 'streakDetails'

const EXACT_KEYS: Record<
  Exclude<CacheGroup, 'photos' | 'memories' | 'publicProfiles' | 'streakDetails'>,
  string[]
> = {
  friends: [SWR_KEYS.friends],
  streaks: [SWR_KEYS.streaks],
  me: [SWR_KEYS.me],
  location: [SWR_KEYS.locationMe, SWR_KEYS.friendLocations],
  legal: [SWR_KEYS.legalStatus],
}

async function invalidateExactKeys(keys: string[]) {
  await Promise.all(keys.map((key) => mutate(key, undefined, { revalidate: true })))
}

async function invalidateKeyPrefix(prefix: string) {
  await mutate((key) => typeof key === 'string' && key.startsWith(prefix), undefined, {
    revalidate: true,
  })
}

async function invalidateStreakDetails() {
  await mutate((key) => typeof key === 'string' && key.startsWith('/api/streaks/'), undefined, {
    revalidate: true,
  })
}

/** Revalidates related SWR caches after mutations or realtime events. */
export async function invalidateCacheGroups(...groups: CacheGroup[]) {
  const tasks: Promise<void>[] = []

  for (const group of groups) {
    switch (group) {
      case 'photos':
        tasks.push(invalidateKeyPrefix('/api/users/photos'))
        break
      case 'memories':
        tasks.push(invalidateKeyPrefix('/api/memories'))
        break
      case 'publicProfiles':
        tasks.push(invalidateKeyPrefix('/api/public/users/'))
        break
      case 'streakDetails':
        tasks.push(invalidateStreakDetails())
        break
      default:
        tasks.push(invalidateExactKeys(EXACT_KEYS[group]))
    }
  }

  await Promise.all(tasks)
}

function mutationPath(url: string | undefined): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return new URL(url).pathname
  }
  return url.split('?')[0] ?? url
}

/** Maps successful write requests to cache groups that should refresh. */
export function invalidateAfterMutation(method: string | undefined, url: string | undefined) {
  const verb = (method ?? 'GET').toUpperCase()
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return

  const path = mutationPath(url)

  if (path.startsWith('/api/friends')) {
    void invalidateCacheGroups('friends', 'publicProfiles')
    return
  }

  if (path === '/api/streaks') {
    void invalidateCacheGroups('streaks')
    return
  }

  if (path.startsWith('/api/streaks/')) {
    void invalidateCacheGroups('streaks', 'streakDetails', 'me', 'photos', 'memories')
    return
  }

  if (path.startsWith('/api/users')) {
    void invalidateCacheGroups('me')
    if (path.includes('/avatar') || path.includes('/public')) {
      void invalidateCacheGroups('publicProfiles')
    }
    if (path.includes('/avatar')) {
      void invalidateCacheGroups('photos')
    }
    return
  }

  if (path.startsWith('/api/location')) {
    void invalidateCacheGroups('location')
    return
  }

  if (path.startsWith('/api/legal')) {
    void invalidateCacheGroups('legal')
  }
}

/** Maps push/socket notification types to cache groups that should refresh. */
export function invalidateAfterNotification(type: string | undefined) {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      void invalidateCacheGroups('friends', 'publicProfiles')
      break
    case 'meet':
    case 'meet_extended':
    case 'meet_photo_added':
      void invalidateCacheGroups('streaks', 'streakDetails', 'me', 'photos', 'memories')
      break
    case 'remote_selfie_request':
    case 'remote_selfie_completed':
    case 'streak_remind':
    case 'streak_1h':
    case 'streak_30m':
    case 'streak_burned':
      void invalidateCacheGroups('streaks', 'streakDetails')
      break
    default:
      break
  }
}

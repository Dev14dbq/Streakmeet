import { mutate } from 'swr'
import type { FriendListItem } from '@streakmeet/api-spec'
import { SWR_KEYS } from './swrKeys'
import type { SyncEnvelope } from '../connect/syncStream'

export interface FriendSyncPayload {
  eventType: string
  friendship: FriendListItem
}

/** Patch SWR caches from a live SyncEnvelope (no refetch). */
export function applySyncEvent(env: SyncEnvelope): void {
  if (env.payload.case !== 'friendEvent') return
  patchFriendsCache(env.payload.value)
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

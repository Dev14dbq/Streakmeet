import { describe, expect, it } from 'vitest'
import { dedupeFeedItems, groupFeedByMonth, unlockProgress } from '../memoriesFeed'
import type { MemoryFeedItem } from '../api/memories'

describe('memoriesFeed', () => {
  it('dedupes feed items by id', () => {
    const items: MemoryFeedItem[] = [
      {
        id: 'a',
        kind: 'meet',
        date: '2024-06-01',
        createdAt: '2024-06-01T10:00:00.000Z',
        streakId: 's1',
        partner: { id: 'p1', nickname: 'alex', avatarUrl: null },
        photoUrl: '/a.jpg',
        uploadedBy: { id: 'u1', nickname: 'me' },
        latitude: null,
        longitude: null,
      },
      {
        id: 'a',
        kind: 'meet',
        date: '2024-06-01',
        createdAt: '2024-06-01T10:00:00.000Z',
        streakId: 's1',
        partner: { id: 'p1', nickname: 'alex', avatarUrl: null },
        photoUrl: '/a.jpg',
        uploadedBy: { id: 'u1', nickname: 'me' },
        latitude: null,
        longitude: null,
      },
    ]

    expect(dedupeFeedItems(items)).toHaveLength(1)
  })

  it('groups items by month and date', () => {
    const milestone: MemoryFeedItem = {
      id: 'm1',
      kind: 'milestone',
      date: '2024-06-07',
      streakId: 's1',
      partner: { id: 'p1', nickname: 'alex', avatarUrl: null },
      milestoneDays: 7,
    }
    const meet: MemoryFeedItem = {
      id: 'meet1',
      kind: 'meet',
      date: '2024-06-07',
      createdAt: '2024-06-07T10:00:00.000Z',
      streakId: 's1',
      partner: { id: 'p1', nickname: 'alex', avatarUrl: null },
      photoUrl: '/meet.jpg',
      uploadedBy: { id: 'u1', nickname: 'me' },
      latitude: null,
      longitude: null,
    }

    const grouped = groupFeedByMonth([milestone, meet])
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.[1]).toHaveLength(1)
    expect(grouped[0]?.[1][0]?.[1]).toHaveLength(2)
  })

  it('calculates unlock progress', () => {
    expect(unlockProgress(7, 4)).toBe(43)
    expect(unlockProgress(7, 0)).toBe(100)
  })
})

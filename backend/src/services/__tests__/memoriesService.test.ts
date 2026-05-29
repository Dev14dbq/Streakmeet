import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = vi.hoisted(() => ({
  countMetDaysForUser: vi.fn(),
  maxActiveStreakCount: vi.fn(),
  listMeetProofsForUser: vi.fn(),
  listMetDaysForUser: vi.fn(),
  loadPartnerByStreakId: vi.fn(),
  partnerFromProof: vi.fn(),
}))

const streakAccessMock = vi.hoisted(() => ({
  findStreakForUser: vi.fn(),
}))

vi.mock('../../lib/memoriesRepository.js', () => repoMock)
vi.mock('../../lib/streakAccess.js', () => streakAccessMock)

import { getMemoriesFeed } from '../memoriesService.js'

describe('getMemoriesFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repoMock.countMetDaysForUser.mockResolvedValue(0)
    repoMock.maxActiveStreakCount.mockResolvedValue(3)
  })

  it('returns locked response until the user has enough MET days', async () => {
    const response = await getMemoriesFeed('user-1', 1, 20)

    expect(response).toEqual({
      unlocked: false,
      daysUntilUnlock: 4,
      unlockAtDays: 7,
      page: 1,
      limit: 20,
      hasMore: false,
      milestones: [],
      items: [],
    })
    expect(repoMock.listMeetProofsForUser).not.toHaveBeenCalled()
  })

  it('returns feed items when the user is unlocked', async () => {
    repoMock.countMetDaysForUser.mockResolvedValue(7)
    repoMock.maxActiveStreakCount.mockResolvedValue(7)
    repoMock.listMetDaysForUser.mockResolvedValue([
      { streakId: 'streak-1', date: '2024-06-01' },
      { streakId: 'streak-1', date: '2024-06-02' },
      { streakId: 'streak-1', date: '2024-06-03' },
      { streakId: 'streak-1', date: '2024-06-04' },
      { streakId: 'streak-1', date: '2024-06-05' },
      { streakId: 'streak-1', date: '2024-06-06' },
      { streakId: 'streak-1', date: '2024-06-07' },
    ])
    repoMock.loadPartnerByStreakId.mockResolvedValue(
      new Map([
        ['streak-1', { id: 'partner-1', nickname: 'alex', avatarUrl: 'https://cdn/a.avif' }],
      ])
    )
    repoMock.listMeetProofsForUser.mockResolvedValue([
      {
        id: 'proof-1',
        photoUrl: 'https://cdn/meet.avif',
        latitude: 1,
        longitude: 2,
        createdAt: new Date('2024-06-07T10:00:00.000Z'),
        uploadedBy: { id: 'user-1', nickname: 'me' },
        streakDay: {
          date: '2024-06-07',
          streakId: 'streak-1',
          streak: {
            id: 'streak-1',
            userA: { id: 'user-1', nickname: 'me', avatarUrl: null },
            userB: { id: 'partner-1', nickname: 'alex', avatarUrl: 'https://cdn/a.avif' },
          },
        },
      },
    ])
    repoMock.partnerFromProof.mockReturnValue({
      id: 'partner-1',
      nickname: 'alex',
      avatarUrl: 'https://cdn/a.avif',
    })

    const response = await getMemoriesFeed('user-1', 1, 20)

    expect(response.unlocked).toBe(true)
    expect(response.milestones).toHaveLength(1)
    expect(response.milestones[0]).toMatchObject({
      kind: 'milestone',
      milestoneDays: 7,
      date: '2024-06-07',
    })
    expect(response.items.some((item) => item.kind === 'meet')).toBe(true)
    expect(response.hasMore).toBe(false)
  })

  it('validates streak access when streakId filter is provided', async () => {
    streakAccessMock.findStreakForUser.mockRejectedValue(new Error('not found'))

    await expect(getMemoriesFeed('user-1', 1, 20, 'streak-x')).rejects.toThrow('not found')
    expect(streakAccessMock.findStreakForUser).toHaveBeenCalledWith('streak-x', 'user-1')
  })
})

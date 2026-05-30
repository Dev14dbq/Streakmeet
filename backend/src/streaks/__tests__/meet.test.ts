import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCodes } from '../../common/errors.js'
import { ApiHttpError } from '../../common/errors.js'

const { mockTx, prismaMock } = vi.hoisted(() => {
  const mockTx = {
    streakDay: { create: vi.fn() },
    streak: { update: vi.fn() },
    user: { updateMany: vi.fn() },
    meetProof: { create: vi.fn() },
  }

  const prismaMock = {
    streak: { findUnique: vi.fn() },
    streakDay: { findUnique: vi.fn() },
    meetProof: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<string>) => fn(mockTx)),
  }

  return { mockTx, prismaMock }
})

vi.mock('../../db/client.js', () => ({
  prisma: prismaMock,
}))

import { recordMeetForStreak } from '../meet.js'

const baseInput = {
  streakId: 'streak-1',
  calendarDate: '2024-06-01',
  uploadedById: 'user-a',
  photoUrl: 'https://cdn/meet.avif',
  photoHash: 'hash-abc',
  facesDetected: 2,
  matchScores: { self: 0.9, partner: 0.85 },
}

describe('recordMeetForStreak', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.streak.findUnique.mockResolvedValue({
      id: 'streak-1',
      lastMetDate: null,
      userAId: 'user-a',
      userBId: 'user-b',
    })
    prismaMock.streakDay.findUnique.mockResolvedValue(null)
    prismaMock.meetProof.findFirst.mockResolvedValue(null)
    mockTx.streakDay.create.mockResolvedValue({ id: 'day-1' })
    mockTx.meetProof.create.mockResolvedValue({ id: 'proof-1' })
  })

  it('throws when the streak does not exist', async () => {
    prismaMock.streak.findUnique.mockResolvedValue(null)

    await expect(recordMeetForStreak(baseInput)).rejects.toMatchObject({
      status: 404,
      code: ErrorCodes.STREAK_NOT_FOUND,
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('returns duplicate without writing when the photo hash already exists', async () => {
    prismaMock.streakDay.findUnique.mockResolvedValue({ id: 'day-existing' })
    prismaMock.meetProof.findFirst.mockResolvedValue({ id: 'proof-dup' })

    await expect(recordMeetForStreak(baseInput)).resolves.toEqual({
      extended: false,
      duplicate: true,
      streakDayId: 'day-existing',
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('extends the streak, awards gems, and creates meet proof on first meet of the day', async () => {
    const result = await recordMeetForStreak(baseInput)

    expect(result).toEqual({
      extended: true,
      duplicate: false,
      streakDayId: 'day-1',
    })
    expect(mockTx.streakDay.create).toHaveBeenCalledWith({
      data: { streakId: 'streak-1', date: '2024-06-01', status: 'MET' },
    })
    expect(mockTx.streak.update).toHaveBeenCalledWith({
      where: { id: 'streak-1' },
      data: { count: { increment: 1 }, lastMetDate: '2024-06-01' },
    })
    expect(mockTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-a', 'user-b'] } },
      data: { gemsBalance: { increment: 1 } },
    })
    expect(mockTx.meetProof.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        streakDayId: 'day-1',
        uploadedById: 'user-a',
        photoUrl: baseInput.photoUrl,
        photoHash: baseInput.photoHash,
        facesDetected: 2,
        matchScores: baseInput.matchScores,
      }),
    })
  })

  it('adds another meet proof without extending when already met today', async () => {
    prismaMock.streak.findUnique.mockResolvedValue({
      id: 'streak-1',
      lastMetDate: '2024-06-01',
      userAId: 'user-a',
      userBId: 'user-b',
    })
    prismaMock.streakDay.findUnique.mockResolvedValue({ id: 'day-existing' })

    const result = await recordMeetForStreak(baseInput)

    expect(result).toEqual({
      extended: false,
      duplicate: false,
      streakDayId: 'day-existing',
    })
    expect(mockTx.streakDay.create).not.toHaveBeenCalled()
    expect(mockTx.streak.update).not.toHaveBeenCalled()
    expect(mockTx.user.updateMany).not.toHaveBeenCalled()
    expect(mockTx.meetProof.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        streakDayId: 'day-existing',
        photoHash: baseInput.photoHash,
      }),
    })
  })

  it('propagates transaction failures as errors', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new ApiHttpError(500, ErrorCodes.INTERNAL_ERROR))

    await expect(recordMeetForStreak(baseInput)).rejects.toBeInstanceOf(ApiHttpError)
  })
})

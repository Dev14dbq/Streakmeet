import { describe, expect, it } from 'vitest'
import { computeMilestonesFromMetDays, isNextCalendarDay } from '../memoriesMilestones.js'

describe('isNextCalendarDay', () => {
  it('returns true for consecutive calendar days', () => {
    expect(isNextCalendarDay('2024-06-01', '2024-06-02')).toBe(true)
  })

  it('returns false when days are not consecutive', () => {
    expect(isNextCalendarDay('2024-06-01', '2024-06-03')).toBe(false)
  })
})

describe('computeMilestonesFromMetDays', () => {
  it('emits milestone cards on configured streak lengths', () => {
    const days = Array.from({ length: 8 }, (_, index) => ({
      streakId: 'streak-1',
      date: `2024-06-${String(index + 1).padStart(2, '0')}`,
    }))

    const milestones = computeMilestonesFromMetDays(days)

    expect(milestones).toEqual([{ streakId: 'streak-1', date: '2024-06-07', days: 7 }])
  })

  it('restarts milestone counting after a gap in MET days', () => {
    const days = [
      { streakId: 'streak-1', date: '2024-06-01' },
      { streakId: 'streak-1', date: '2024-06-02' },
      { streakId: 'streak-1', date: '2024-06-03' },
      { streakId: 'streak-1', date: '2024-06-10' },
      { streakId: 'streak-1', date: '2024-06-11' },
      { streakId: 'streak-1', date: '2024-06-12' },
      { streakId: 'streak-1', date: '2024-06-13' },
      { streakId: 'streak-1', date: '2024-06-14' },
      { streakId: 'streak-1', date: '2024-06-15' },
      { streakId: 'streak-1', date: '2024-06-16' },
      { streakId: 'streak-1', date: '2024-06-17' },
    ]

    const milestones = computeMilestonesFromMetDays(days)

    expect(milestones).toEqual([{ streakId: 'streak-1', date: '2024-06-16', days: 7 }])
  })

  it('computes milestones independently per streak', () => {
    const days = [
      { streakId: 'streak-a', date: '2024-06-01' },
      { streakId: 'streak-a', date: '2024-06-02' },
      { streakId: 'streak-a', date: '2024-06-03' },
      { streakId: 'streak-a', date: '2024-06-04' },
      { streakId: 'streak-a', date: '2024-06-05' },
      { streakId: 'streak-a', date: '2024-06-06' },
      { streakId: 'streak-a', date: '2024-06-07' },
      { streakId: 'streak-b', date: '2024-06-01' },
      { streakId: 'streak-b', date: '2024-06-02' },
      { streakId: 'streak-b', date: '2024-06-03' },
      { streakId: 'streak-b', date: '2024-06-04' },
      { streakId: 'streak-b', date: '2024-06-05' },
      { streakId: 'streak-b', date: '2024-06-06' },
      { streakId: 'streak-b', date: '2024-06-07' },
    ]

    const milestones = computeMilestonesFromMetDays(days)

    expect(milestones).toHaveLength(2)
    expect(milestones.every((m) => m.days === 7)).toBe(true)
  })
})

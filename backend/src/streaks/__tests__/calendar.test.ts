import { describe, expect, it } from 'vitest'
import {
  generousStreakTimezone,
  getUtcOffsetMinutes,
  isStreakMetOnDate,
  isStreakMetToday,
  streakCalendarDate,
} from '@streakmeet/shared'

describe('generousStreakTimezone', () => {
  const winter = new Date('2024-01-15T12:00:00Z')

  it('picks the westernmost timezone (latest local midnight)', () => {
    expect(generousStreakTimezone('America/Los_Angeles', 'Europe/Moscow', winter)).toBe(
      'America/Los_Angeles'
    )
  })

  it('falls back to UTC for invalid timezones', () => {
    expect(generousStreakTimezone('Invalid/TZ', 'Europe/London', winter)).toBe('Europe/London')
    expect(generousStreakTimezone('Invalid/A', 'Invalid/B', winter)).toBe('UTC')
  })

  it('uses lexicographic tie-break when offsets are equal', () => {
    expect(generousStreakTimezone('Europe/London', 'Europe/Lisbon', winter)).toBe('Europe/Lisbon')
  })
})

describe('streakCalendarDate', () => {
  it('returns YYYY-MM-DD in the streak timezone', () => {
    const instant = new Date('2024-06-15T23:30:00Z')
    expect(streakCalendarDate('Pacific/Kiritimati', instant)).toBe('2024-06-16')
    expect(streakCalendarDate('America/Los_Angeles', instant)).toBe('2024-06-15')
  })
})

describe('isStreakMetToday', () => {
  it('matches lastMetDate against today in streak timezone', () => {
    const at = new Date('2024-03-10T15:00:00Z')
    expect(isStreakMetToday({ lastMetDate: '2024-03-10', timezone: 'UTC' }, at)).toBe(true)
    expect(isStreakMetToday({ lastMetDate: '2024-03-09', timezone: 'UTC' }, at)).toBe(false)
    expect(isStreakMetToday({ lastMetDate: null, timezone: 'UTC' }, at)).toBe(false)
  })
})

describe('getUtcOffsetMinutes', () => {
  it('returns positive offset east of UTC', () => {
    const winter = new Date('2024-01-15T12:00:00Z')
    expect(getUtcOffsetMinutes('Europe/Moscow', winter)).toBe(180)
  })
})

describe('isStreakMetOnDate', () => {
  it('compares calendar date strings', () => {
    expect(isStreakMetOnDate('2024-01-01', '2024-01-01')).toBe(true)
    expect(isStreakMetOnDate('2024-01-01', '2024-01-02')).toBe(false)
    expect(isStreakMetOnDate(null, '2024-01-01')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { pairWhere, partnerIdOf, partnerOf, streakForUserWhere } from '../relations.js'

function coversBothOrderings(
  where: ReturnType<typeof pairWhere>,
  userAId: string,
  userBId: string
): boolean {
  const { OR } = where
  return (
    OR.some((clause) => clause.userAId === userAId && clause.userBId === userBId) &&
    OR.some((clause) => clause.userAId === userBId && clause.userBId === userAId)
  )
}

describe('pairWhere', () => {
  it('matches both orderings of the pair', () => {
    expect(pairWhere('a', 'b')).toEqual({
      OR: [
        { userAId: 'a', userBId: 'b' },
        { userAId: 'b', userBId: 'a' },
      ],
    })
  })

  it('is symmetric: swapping arguments still covers both participant orderings', () => {
    const forward = pairWhere('alice', 'bob')
    const reverse = pairWhere('bob', 'alice')

    expect(coversBothOrderings(forward, 'alice', 'bob')).toBe(true)
    expect(coversBothOrderings(reverse, 'alice', 'bob')).toBe(true)
    expect(forward.OR).toHaveLength(2)
    expect(reverse.OR).toHaveLength(2)
  })
})

describe('streakForUserWhere', () => {
  it('includes streaks where user is either participant', () => {
    expect(streakForUserWhere('me')).toEqual({
      OR: [{ userAId: 'me' }, { userBId: 'me' }],
    })
  })
})

describe('partnerIdOf', () => {
  it('returns the other participant id', () => {
    const streak = { userAId: 'alice', userBId: 'bob' }
    expect(partnerIdOf(streak, 'alice')).toBe('bob')
    expect(partnerIdOf(streak, 'bob')).toBe('alice')
  })
})

describe('partnerOf', () => {
  it('returns the other participant record', () => {
    const streak = {
      userAId: 'alice',
      userBId: 'bob',
      userA: { nickname: 'Alice' },
      userB: { nickname: 'Bob' },
    }
    expect(partnerOf(streak, 'alice')).toEqual({ nickname: 'Bob' })
    expect(partnerOf(streak, 'bob')).toEqual({ nickname: 'Alice' })
  })
})

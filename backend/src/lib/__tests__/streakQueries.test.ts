import { describe, expect, it } from 'vitest'
import { mapPendingRemoteSelfie, pendingRemoteSelfiesInclude } from '../streakQueries.js'

describe('pendingRemoteSelfiesInclude', () => {
  it('scopes pending requests to the user as sender or receiver', () => {
    const include = pendingRemoteSelfiesInclude('viewer')
    expect(include.where.status).toBe('PENDING')
    expect(include.where.OR).toEqual([{ receiverId: 'viewer' }, { senderId: 'viewer' }])
    expect(include.take).toBe(1)
  })
})

describe('mapPendingRemoteSelfie', () => {
  const row = {
    id: 'req-1',
    senderId: 'alice',
    receiverId: 'bob',
    senderPhotoUrl: 'https://cdn/photo.avif',
    sender: { id: 'alice', nickname: 'alice' },
  }

  it('returns null when there is no pending request', () => {
    expect(mapPendingRemoteSelfie(undefined, 'bob')).toBeNull()
  })

  it('marks needsReply when the viewer is the receiver', () => {
    expect(mapPendingRemoteSelfie(row, 'bob')).toEqual({
      id: 'req-1',
      senderId: 'alice',
      receiverId: 'bob',
      senderPhotoUrl: 'https://cdn/photo.avif',
      needsReply: true,
      senderNickname: 'alice',
    })
  })

  it('marks needsReply false when the viewer sent the request', () => {
    expect(mapPendingRemoteSelfie(row, 'alice')).toMatchObject({ needsReply: false })
  })
})

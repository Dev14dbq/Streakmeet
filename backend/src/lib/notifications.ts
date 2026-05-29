import { notifyUser, type NotificationPayload } from './socket.js'

export type { NotificationPayload, NotificationType } from './socket.js'

function emit(recipientId: string, payload: NotificationPayload): void {
  notifyUser(recipientId, 'notification', payload)
}

export function notifyFriendRequest(recipientId: string, requesterNickname: string): void {
  emit(recipientId, {
    type: 'friend_request',
    params: { nickname: requesterNickname },
    route: '/',
  })
}

export function notifyFriendAccepted(recipientId: string, accepterNickname: string): void {
  emit(recipientId, {
    type: 'friend_accepted',
    params: { nickname: accepterNickname },
    route: '/',
  })
}

export function notifyMeetExtended(partnerId: string, metWithNickname: string): void {
  emit(partnerId, {
    type: 'meet_extended',
    params: { nickname: metWithNickname },
    route: '/',
  })
}

export function notifyMeetPhotoAdded(partnerId: string, uploaderNickname: string): void {
  emit(partnerId, {
    type: 'meet_photo_added',
    params: { nickname: uploaderNickname },
    route: '/',
  })
}

export function notifyRemoteSelfieRequest(
  recipientId: string,
  senderNickname: string
): void {
  emit(recipientId, {
    type: 'remote_selfie_request',
    params: { nickname: senderNickname },
    route: `/streaks/${senderNickname}`,
  })
}

export function notifyRemoteSelfieCompleted(
  senderId: string,
  replierNickname: string,
  extended: boolean
): void {
  emit(senderId, {
    type: 'remote_selfie_completed',
    params: {
      nickname: replierNickname,
      extended: extended ? 'true' : 'false',
    },
    route: `/streaks/${replierNickname}`,
  })
}

export function notifyStreakRemind(
  partnerId: string,
  senderNickname: string,
  variant?: number
): void {
  const v =
    variant !== undefined
      ? Math.min(4, Math.max(0, Math.floor(variant)))
      : Math.floor(Math.random() * 5)
  emit(partnerId, {
    type: 'streak_remind',
    params: { nickname: senderNickname, variant: String(v) },
    route: `/streaks/${senderNickname}`,
  })
}

import i18n from '../i18n'
import type { AppNotificationPayload } from './instantNotifications'

function nick(params?: Record<string, string>): string {
  return params?.nickname?.trim() || i18n.t('notifications.someone')
}

/** Localized text for realtime / push notifications from the server */
export function translateNotification(data: AppNotificationPayload): string {
  const { type, params, message } = data
  if (!type) return message

  switch (type) {
    case 'friend_request':
      return i18n.t('notifications.friendRequest', { nickname: nick(params) })
    case 'friend_accepted':
      return i18n.t('notifications.friendAccepted', { nickname: nick(params) })
    case 'meet_extended':
      return i18n.t('notifications.meetExtended', { nickname: nick(params) })
    case 'meet_photo_added':
      return i18n.t('notifications.meetPhotoAdded', { nickname: nick(params) })
    case 'streak_remind': {
      const v = Math.min(4, Math.max(0, Number(params?.variant ?? 0)))
      return i18n.t(`notifications.streakRemind${v}`, { nickname: nick(params) })
    }
    case 'remote_selfie_request':
      return i18n.t('notifications.remoteSelfieRequest', { nickname: nick(params) })
    case 'remote_selfie_completed':
      return params?.extended === 'true'
        ? i18n.t('notifications.remoteSelfieExtended', { nickname: nick(params) })
        : i18n.t('notifications.remoteSelfiePhoto', { nickname: nick(params) })
    default:
      return message
  }
}

export interface MagicMeetResultParts {
  extendedNicknames?: string[]
  addedNicknames?: string[]
  skippedDuplicates?: string[]
  message?: string
}

export function formatMagicMeetMessage(parts: MagicMeetResultParts): string {
  const lines: string[] = []
  if (parts.extendedNicknames?.length) {
    lines.push(i18n.t('meetResult.extendedWith', { list: parts.extendedNicknames.join(', ') }))
  }
  if (parts.addedNicknames?.length) {
    lines.push(i18n.t('meetResult.photosWith', { list: parts.addedNicknames.join(', ') }))
  }
  if (parts.skippedDuplicates?.length) {
    lines.push(i18n.t('meetResult.skippedDuplicate', { list: parts.skippedDuplicates.join(', ') }))
  }
  return lines.length > 0 ? lines.join('. ') : (parts.message ?? '')
}

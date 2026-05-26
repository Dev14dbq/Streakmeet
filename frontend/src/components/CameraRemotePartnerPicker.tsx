import { useTranslation } from 'react-i18next'
import Avatar from './Avatar'
import CachedImage from './CachedImage'

export interface StreakPartnerOption {
  streakId: string
  partner: {
    id: string
    nickname: string
    avatarUrl?: string | null
  }
  pendingRemoteSelfie?: {
    id: string
    senderPhotoUrl: string
    needsReply: boolean
    senderNickname: string
  } | null
}

interface Props {
  streaks: StreakPartnerOption[]
  onSelect: (streak: StreakPartnerOption, mode: 'init' | 'reply') => void
}

export default function CameraRemotePartnerPicker({ streaks, onSelect }: Props) {
  const { t } = useTranslation()

  const replyStreaks = streaks.filter((s) => s.pendingRemoteSelfie?.needsReply)
  const initStreaks = streaks.filter((s) => !s.pendingRemoteSelfie)

  if (replyStreaks.length === 0 && initStreaks.length === 0) {
    return (
      <div className="fullscreen-camera__picker">
        <p className="fullscreen-camera__picker-title">{t('camera.choosePartner')}</p>
        <p className="fullscreen-camera__picker-empty">{t('camera.noStreaksForRemote')}</p>
      </div>
    )
  }

  return (
    <div className="fullscreen-camera__picker">
      <p className="fullscreen-camera__picker-title">{t('camera.choosePartner')}</p>

      {replyStreaks.length > 0 && (
        <div className="fullscreen-camera__picker-section">
          <p className="fullscreen-camera__picker-label">{t('camera.replyTo')}</p>
          <div className="fullscreen-camera__picker-list">
            {replyStreaks.map((streak) => (
              <button
                key={`reply-${streak.streakId}`}
                type="button"
                className="fullscreen-camera__picker-item fullscreen-camera__picker-item--reply"
                onClick={() => onSelect(streak, 'reply')}
              >
                <div className="fullscreen-camera__picker-thumb">
                  {streak.pendingRemoteSelfie?.senderPhotoUrl ? (
                    <CachedImage
                      path={streak.pendingRemoteSelfie.senderPhotoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Avatar
                      path={streak.partner.avatarUrl}
                      name={streak.partner.nickname}
                      size="lg"
                    />
                  )}
                </div>
                <span className="fullscreen-camera__picker-name">
                  @{streak.pendingRemoteSelfie?.senderNickname ?? streak.partner.nickname}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {initStreaks.length > 0 && (
        <div className="fullscreen-camera__picker-section">
          <p className="fullscreen-camera__picker-label">{t('camera.sendTo')}</p>
          <div className="fullscreen-camera__picker-list">
            {initStreaks.map((streak) => (
              <button
                key={`init-${streak.streakId}`}
                type="button"
                className="fullscreen-camera__picker-item"
                onClick={() => onSelect(streak, 'init')}
              >
                <Avatar path={streak.partner.avatarUrl} name={streak.partner.nickname} size="lg" />
                <span className="fullscreen-camera__picker-name">@{streak.partner.nickname}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

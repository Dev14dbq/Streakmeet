import { useTranslation } from 'react-i18next'
import CachedImage from './CachedImage'
import FullscreenCamera from './FullscreenCamera'

interface Props {
  open: boolean
  mode: 'init' | 'reply'
  friendPhotoUrl?: string | null
  friendNickname?: string
  uploading?: boolean
  onClose: () => void
  onSend: (photoBase64: string) => Promise<void>
}

export default function RemoteSelfieCameraModal({
  open,
  mode,
  friendPhotoUrl,
  friendNickname,
  uploading = false,
  onClose,
  onSend,
}: Props) {
  const { t } = useTranslation()

  const isReply = mode === 'reply'
  const friendLabel = friendNickname ?? t('common.friend')

  const pip =
    isReply && friendPhotoUrl ? (
      <div className="fullscreen-camera__pip-inner">
        <CachedImage path={friendPhotoUrl} alt="" />
        <span className="fullscreen-camera__pip-label">@{friendLabel}</span>
      </div>
    ) : isReply ? (
      <div className="fullscreen-camera__pip-inner flex items-center justify-center bg-zinc-900">
        <span className="text-[10px] text-zinc-400 px-1 text-center">{friendLabel}</span>
      </div>
    ) : undefined

  return (
    <FullscreenCamera
      open={open}
      onClose={onClose}
      onConfirm={onSend}
      confirmLabel={t('camera.continue')}
      processing={uploading}
      processingLabel={isReply ? t('camera.sending') : t('camera.processing')}
      pip={pip}
      closeDisabled={uploading}
    />
  )
}

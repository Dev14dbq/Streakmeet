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
  onSend: (photoBase64: string) => boolean | Promise<boolean>
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

  const splitTop =
    isReply && friendPhotoUrl ? (
      <CachedImage path={friendPhotoUrl} alt="" className="w-full h-full object-cover" />
    ) : undefined

  return (
    <FullscreenCamera
      open={open}
      onClose={onClose}
      onConfirm={onSend}
      confirmLabel={t('camera.continue')}
      processing={uploading}
      processingLabel={isReply ? t('camera.sending') : t('camera.processing')}
      splitTop={splitTop}
      splitTopLabel={isReply ? `@${friendLabel}` : undefined}
      closeDisabled={uploading}
    />
  )
}

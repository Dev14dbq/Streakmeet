import { useTranslation } from 'react-i18next'
import type { CameraAccess } from '../lib/useCameraGate'

type Variant = 'fullscreen' | 'overlay'

interface Props {
  access: CameraAccess
  onRetry: () => void
  variant?: Variant
  className?: string
}

/** Blocks camera UI until permission is granted; offers retry. */
export default function CameraGate({
  access,
  onRetry,
  variant = 'fullscreen',
  className = '',
}: Props) {
  const { t } = useTranslation()

  if (access === 'granted') return null

  const display = access === 'idle' ? 'pending' : access
  const message = display === 'pending' ? t('face.cameraWaiting') : t('face.cameraDenied')

  if (variant === 'overlay') {
    return (
      <div
        className={`absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black/60 px-4 text-center ${className}`}
      >
        {display === 'pending' ? (
          <span className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-brand-primary)]" />
        ) : null}
        <p className="text-xs font-medium text-white/90">{message}</p>
        {display === 'denied' && (
          <button
            type="button"
            className="mt-4 rounded-full bg-[var(--color-brand-primary)] px-5 py-2.5 text-sm font-bold text-white active:scale-95"
            onClick={onRetry}
          >
            {t('face.cameraRetry')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center ${className || 'fullscreen-camera__processing'}`}
    >
      <span className="fullscreen-camera__spinner" />
      <p className="mt-2">{message}</p>
      {display === 'denied' && (
        <button
          type="button"
          className="mt-4 rounded-full bg-[var(--color-brand-primary)] px-6 py-3 text-sm font-bold text-white active:scale-95"
          onClick={onRetry}
        >
          {t('face.cameraRetry')}
        </button>
      )}
    </div>
  )
}

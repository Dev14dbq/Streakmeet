import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Send, X } from 'lucide-react'
import Webcam from 'react-webcam'
import CachedImage from './CachedImage'
import { captureVideoFrame } from '../lib/captureVideoFrame'
import { toastError } from '../lib/toast'

type Phase = 'capture' | 'preview'

interface Props {
  open: boolean
  mode: 'init' | 'reply'
  friendPhotoUrl?: string | null
  friendNickname?: string
  uploading?: boolean
  onClose: () => void
  onSend: (photoBase64: string) => Promise<void>
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 720 },
  aspectRatio: { ideal: 16 / 9 },
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
  const webcamRef = useRef<Webcam>(null)
  const [phase, setPhase] = useState<Phase>('capture')
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  const resetCapture = useCallback(() => {
    setPhase('capture')
    setCapturedPhoto(null)
  }, [])

  useEffect(() => {
    if (!open) {
      resetCapture()
      setCameraReady(false)
    }
  }, [open, resetCapture])

  function handleTakePhoto() {
    const video = webcamRef.current?.video
    if (!video) {
      toastError('Камера не готова')
      return
    }

    const imageSrc = captureVideoFrame(video, { minWidth: 960, quality: 0.92, mirror: true })
    if (!imageSrc) {
      toastError('Не удалось сделать снимок')
      return
    }

    setCapturedPhoto(imageSrc)
    setPhase('preview')
  }

  async function handleSend() {
    if (!capturedPhoto) return
    await onSend(capturedPhoto)
  }

  if (!open) return null

  const isReply = mode === 'reply'

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg">Селфи на расстоянии</h2>
          <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
            {phase === 'preview'
              ? 'Проверь фото перед отправкой'
              : isReply
                ? `Подстрой ракурс под @${friendNickname ?? 'друга'}`
                : 'Держи телефон горизонтально'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          className="p-2 bg-zinc-900 rounded-full text-white disabled:opacity-40"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 gap-3">
        {isReply && (
          <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
            <div className="absolute top-2 left-2 z-10 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              @{friendNickname ?? 'друг'}
            </div>
            {friendPhotoUrl ? (
              <CachedImage path={friendPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-zinc-500">
                Фото друга
              </div>
            )}
          </div>
        )}

        <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
          <div className="absolute top-2 left-2 z-10 rounded-full bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            {phase === 'preview' ? 'Твоё фото' : 'Ты'}
          </div>

          {phase === 'preview' && capturedPhoto ? (
            <img src={capturedPhoto} alt="Превью" className="w-full h-full object-cover" />
          ) : (
            <>
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                forceScreenshotSourceSize
                videoConstraints={VIDEO_CONSTRAINTS}
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                onUserMedia={() => setCameraReady(true)}
                onUserMediaError={() => toastError('Ошибка доступа к камере')}
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                <div className="w-full max-w-lg aspect-video border-2 border-dashed border-white/40 rounded-xl" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shrink-0 flex flex-col gap-2">
        {phase === 'preview' ? (
          <>
            <button
              type="button"
              onClick={resetCapture}
              disabled={uploading}
              className="w-full rounded-full bg-[var(--color-surface-container-high)] py-4 font-bold text-white transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} />
              Переснять
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={uploading || !capturedPhoto}
              className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)] flex items-center justify-center gap-2"
            >
              <Send size={20} />
              {uploading ? 'Отправка...' : isReply ? 'Отправить ответ' : 'Отправить запрос'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleTakePhoto}
            disabled={!cameraReady}
            className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)] flex items-center justify-center gap-2"
          >
            <Camera size={22} />
            Сфотографировать
          </button>
        )}
      </div>
    </div>
  )
}

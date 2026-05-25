import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X } from 'lucide-react'
import Webcam from 'react-webcam'
import { useNavigate } from 'react-router-dom'
import { magicMeet, type AuthUser } from '../lib/api'
import { captureVideoFrame } from '../lib/captureVideoFrame'
import { toastError, toastLink } from '../lib/toast'
import type { MagicMeetResultState } from '../pages/meet/MagicMeetResultPage'

type CaptureStep = 'preview' | 'screenshot' | 'geo' | 'uploading' | 'error'

function logCapture(step: string, detail?: unknown) {
  console.log(`[magic-camera] ${step}`, detail ?? '')
}

const PROCESSING_STEPS: CaptureStep[] = ['screenshot', 'geo', 'uploading']

interface Props {
  variant?: 'side' | 'center'
}

export default function GlobalCamera({ variant = 'side' }: Props) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [step, setStep] = useState<CaptureStep>('preview')
  const [statusDetail, setStatusDetail] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const webcamRef = useRef<Webcam>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) setUser(JSON.parse(stored))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [cameraOpen])

  const resetStatus = useCallback(() => {
    setStep('preview')
    setStatusDetail('')
    setBusy(false)
  }, [])

  function openCamera() {
    if (!user?.faceEnrolled) {
      toastLink(
        'Сначала нужно зарегистрировать лицо в настройках!',
        '/face-enrollment',
        navigate,
        '👤'
      )
      return
    }
    resetStatus()
    setCameraReady(false)
    setCameraOpen(true)
    logCapture('camera opened')
  }

  const runCapture = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStep('screenshot')
    setStatusDetail('Снимаем...')
    logCapture('manual capture triggered')

    const video = webcamRef.current?.video
    if (!video) {
      const msg = 'Видеопоток не найден — перезагрузи страницу'
      logCapture('error: no video element')
      setStep('error')
      setStatusDetail(msg)
      toastError(msg)
      setBusy(false)
      return
    }

    await new Promise((r) => setTimeout(r, 50))

    const imageSrc = captureVideoFrame(video, { minWidth: 640, quality: 0.92 })
    if (!imageSrc) {
      const msg = 'Не удалось сделать снимок — попробуй ещё раз'
      logCapture('error: captureVideoFrame returned null', {
        readyState: video.readyState,
        width: video.videoWidth,
        height: video.videoHeight,
      })
      setStep('error')
      setStatusDetail(msg)
      toastError(msg)
      setBusy(false)
      return
    }

    logCapture('screenshot ok', {
      bytes: imageSrc.length,
      stream: `${video.videoWidth}x${video.videoHeight}`,
    })

    let location: { lat: number; lng: number } | undefined
    const geoEnabled = (() => {
      try {
        return JSON.parse(localStorage.getItem('streakmeet_settings') || '{}').geoOnPhotos !== false
      } catch {
        return true
      }
    })()

    if (geoEnabled) {
      setStep('geo')
      setStatusDetail('Получаем геолокацию...')
      logCapture('requesting geolocation')
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
        )
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        logCapture('geolocation ok', location)
      } catch (e) {
        logCapture('geolocation skipped', e)
        setStatusDetail('GPS недоступен — продолжаем без него')
      }
    }

    setStep('uploading')
    setStatusDetail('Распознаём лица...')
    logCapture('POST /api/streaks/magic-meet')

    try {
      const { data } = await magicMeet({ photoBase64: imageSrc, location })
      logCapture('success', data)

      const resultState: MagicMeetResultState = {
        photo: imageSrc,
        message: data.message,
        partners: data.partners ?? [],
      }

      setCameraOpen(false)
      resetStatus()
      navigate('/magic-meet/success', { state: resultState, replace: true })
    } catch (e: any) {
      const msg =
        e.response?.data?.error ||
        (e.code === 'ECONNABORTED'
          ? 'Сервер не ответил вовремя — распознавание заняло слишком долго'
          : null) ||
        e.message ||
        'Ошибка проверки'
      logCapture('api error', { msg, status: e.response?.status, code: e.code })
      setStep('error')
      setStatusDetail(msg)
      toastError(msg)
      setBusy(false)
    }
  }, [busy, navigate, resetStatus])

  if (!user) return null

  const processing = PROCESSING_STEPS.includes(step)
  const statusText =
    statusDetail ||
    (step === 'error'
      ? 'Ошибка'
      : processing
        ? 'Обработка...'
        : 'Сфотографируйтесь вместе с другом')

  const cameraModal = cameraOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black flex flex-col pointer-events-auto touch-manipulation"
          style={{ height: '100dvh' }}
        >
          <div className="flex items-center justify-between px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 shrink-0">
            <h2 className="text-white font-bold text-xl">Магическая камера</h2>
            <button
              type="button"
              onClick={() => {
                setCameraOpen(false)
                resetStatus()
              }}
              disabled={step === 'uploading'}
              className="p-2 bg-zinc-900 rounded-full text-white disabled:opacity-40"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mx-6 mb-3 rounded-2xl bg-zinc-900/90 border border-white/10 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              {processing && (
                <span className="w-4 h-4 border-2 border-[var(--color-brand-primary)]/30 border-t-[var(--color-brand-primary)] rounded-full animate-spin shrink-0" />
              )}
              <p
                className={`text-sm font-semibold ${step === 'error' ? 'text-red-400' : 'text-white'}`}
              >
                {statusText}
              </p>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              {cameraReady ? '● Камера готова' : '○ Ждём камеру...'}
              {!processing && step !== 'error' ? ' · на фото должны быть вы оба' : ''}
            </p>
          </div>

          <div className="relative flex-1 min-h-0 mx-4 mb-4 rounded-3xl overflow-hidden bg-zinc-900">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              forceScreenshotSourceSize
              videoConstraints={{
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
              onUserMedia={() => {
                setCameraReady(true)
                logCapture('camera stream started')
              }}
              onUserMediaError={(err) => {
                const msg = typeof err === 'string' ? err : err.message
                logCapture('camera error', msg)
                setStep('error')
                setStatusDetail(`Ошибка камеры: ${msg}`)
              }}
            />

            {!processing && step !== 'error' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.35)',
                  borderRadius: '1.5rem',
                }}
              />
            )}

            {processing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <span className="w-10 h-10 border-2 border-[var(--color-brand-primary)]/30 border-t-[var(--color-brand-primary)] rounded-full animate-spin" />
                <p className="text-white font-semibold text-sm">{statusDetail}</p>
              </div>
            )}
          </div>

          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0">
            {step === 'error' ? (
              <button
                type="button"
                onClick={resetStatus}
                className="w-full rounded-full bg-[var(--color-surface-container-high)] py-4 font-bold text-lg text-white transition active:scale-95"
              >
                Попробовать снова
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runCapture()}
                disabled={!cameraReady || busy}
                className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
              >
                {busy ? 'Обработка...' : 'Сфотографировать'}
              </button>
            )}
          </div>
        </div>,
        document.body
      )
    : null

  const fabClass =
    variant === 'center'
      ? 'w-[68px] h-[68px] bg-[var(--color-brand-primary)] rounded-full shadow-[0_12px_36px_rgba(255,26,79,0.55)] ring-4 ring-black flex items-center justify-center text-white transition hover:scale-105 active:scale-95 pointer-events-auto touch-manipulation'
      : 'w-[60px] h-[60px] shrink-0 bg-[var(--color-brand-primary)] rounded-full shadow-[0_8px_30px_rgba(255,26,79,0.4)] flex items-center justify-center text-white transition hover:bg-[var(--color-primary-container)] active:scale-90 pointer-events-auto touch-manipulation'

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={fabClass}
        aria-label="Сфотографироваться с другом"
      >
        <Camera size={variant === 'center' ? 30 : 28} />
      </button>
      {cameraModal}
    </>
  )
}

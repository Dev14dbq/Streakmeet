import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, SwitchCamera, Timer, X, Zap } from 'lucide-react'
import Webcam from 'react-webcam'
import { captureVideoFrame } from '../lib/captureVideoFrame'
import { triggerCameraShutterFeedback } from '../lib/cameraShutter'
import { toastError } from '../lib/toast'

type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean }
  applyConstraints: (
    c: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> }
  ) => Promise<void>
}
export type CameraTimer = 'off' | 3 | 10
export type CameraCaptureMode = 'meet' | 'remote'

export interface CameraModeOption {
  id: CameraCaptureMode
  label: string
}

type Phase = 'live' | 'preview' | 'processing'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (photoBase64: string) => void | Promise<void>
  confirmLabel: string
  processing?: boolean
  processingLabel?: string
  closeDisabled?: boolean
  /** Half-screen friend photo during remote selfie reply */
  splitTop?: React.ReactNode
  splitTopLabel?: string
  captureMode?: CameraCaptureMode
  onCaptureModeChange?: (mode: CameraCaptureMode) => void
  modeOptions?: CameraModeOption[]
  bottomOverlay?: React.ReactNode
  shutterDisabled?: boolean
}

function timerLabel(timer: CameraTimer, t: (key: string) => string): string {
  if (timer === 3) return t('camera.timer3')
  if (timer === 10) return t('camera.timer10')
  return t('camera.timerOff')
}

function LiveWebcam({
  facingMode,
  isFront,
  webcamRef,
  className,
  onReady,
  onError,
}: {
  facingMode: 'user' | 'environment'
  isFront: boolean
  webcamRef: React.RefObject<Webcam | null>
  className?: string
  onReady: (stream: MediaStream) => void
  onError: (err: string | DOMException) => void
}) {
  return (
    <Webcam
      key={facingMode}
      ref={webcamRef}
      audio={false}
      screenshotFormat="image/jpeg"
      forceScreenshotSourceSize
      videoConstraints={{
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }}
      className={`fullscreen-camera__media ${isFront ? 'fullscreen-camera__media--mirror' : ''} ${className ?? ''}`}
      onUserMedia={onReady}
      onUserMediaError={onError}
    />
  )
}

export default function FullscreenCamera({
  open,
  onClose,
  onConfirm,
  confirmLabel,
  processing = false,
  processingLabel,
  closeDisabled = false,
  splitTop,
  splitTopLabel,
  captureMode,
  onCaptureModeChange,
  modeOptions,
  bottomOverlay,
  shutterDisabled = false,
}: Props) {
  const { t } = useTranslation()
  const webcamRef = useRef<Webcam>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [phase, setPhase] = useState<Phase>('live')
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [timer, setTimer] = useState<CameraTimer>('off')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [shutterFlash, setShutterFlash] = useState(false)

  const isFront = facingMode === 'user'
  const useSplit = !!splitTop && phase === 'live'
  const showModeSwitcher = !!(modeOptions?.length && onCaptureModeChange && phase === 'live')

  const resetLive = useCallback(() => {
    setPhase('live')
    setCapturedPhoto(null)
    setCountdown(null)
    setShutterFlash(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const setTorch = useCallback(async (enabled: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled }] })
      setTorchOn(enabled)
    } catch {
      setTorchOn(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      resetLive()
      setCameraReady(false)
      setFacingMode('user')
      setTimer('off')
      setTorchAvailable(false)
      setTorchOn(false)
      void setTorch(false)
    }
  }, [open, resetLive, setTorch])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (processing) {
      setPhase('processing')
    } else if (capturedPhoto) {
      setPhase('preview')
    }
  }, [processing, capturedPhoto])

  const inspectStream = useCallback((stream: MediaStream | null) => {
    streamRef.current = stream
    const track = stream?.getVideoTracks()[0] as TorchTrack | undefined
    if (!track) {
      setTorchAvailable(false)
      return
    }
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined
    setTorchAvailable(!!caps?.torch)
    if (!caps?.torch) setTorchOn(false)
  }, [])

  const onStreamReady = useCallback(
    (stream: MediaStream) => {
      inspectStream(stream)
      setCameraReady(true)
    },
    [inspectStream]
  )

  const onStreamError = useCallback(
    (err: string | DOMException) => {
      const msg = typeof err === 'string' ? err : err.message
      toastError(t('face.cameraError', { message: msg }))
    },
    [t]
  )

  const cycleTimer = () => {
    setTimer((cur: CameraTimer) => (cur === 'off' ? 3 : cur === 3 ? 10 : 'off'))
  }

  const takePhoto = useCallback(() => {
    const video = webcamRef.current?.video
    if (!video) {
      toastError(t('camera.notReady'))
      return
    }

    const imageSrc = captureVideoFrame(video, {
      minWidth: 960,
      quality: 0.92,
      mirror: isFront,
      enhance: true,
    })
    if (!imageSrc) {
      toastError(t('camera.captureFailed'))
      return
    }

    triggerCameraShutterFeedback()
    setShutterFlash(true)
    setCapturedPhoto(imageSrc)
    setPhase('preview')
    setCountdown(null)
  }, [isFront, t])

  const handleShutter = useCallback(() => {
    if (phase !== 'live' || countdown !== null || !cameraReady || shutterDisabled) return

    if (timer === 'off') {
      takePhoto()
      return
    }

    let left = timer
    setCountdown(left)
    timerRef.current = setInterval(() => {
      left -= 1
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        setCountdown(null)
        takePhoto()
      } else {
        setCountdown(left)
      }
    }, 1000)
  }, [phase, countdown, cameraReady, timer, takePhoto, shutterDisabled])

  const handleFlip = () => {
    if (torchOn) void setTorch(false)
    setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))
    setCameraReady(false)
  }

  const handleToggleTorch = () => {
    if (!torchAvailable) return
    void setTorch(!torchOn)
  }

  async function handleConfirm() {
    if (!capturedPhoto || processing) return
    await onConfirm(capturedPhoto)
  }

  if (!open) return null

  const showLive = phase === 'live'
  const showPreview = phase === 'preview' || phase === 'processing'

  return (
    <div className="fullscreen-camera" style={{ height: '100dvh' }}>
      <div className="fullscreen-camera__viewport">
        {showPreview && capturedPhoto ? (
          <img src={capturedPhoto} alt="" className="fullscreen-camera__media" />
        ) : useSplit ? (
          <div className="fullscreen-camera__split">
            <div className="fullscreen-camera__split-top">
              {splitTopLabel && (
                <span className="fullscreen-camera__split-label">{splitTopLabel}</span>
              )}
              {splitTop}
            </div>
            <div className="fullscreen-camera__split-bottom">
              <span className="fullscreen-camera__split-label">{t('camera.you')}</span>
              <LiveWebcam
                facingMode={facingMode}
                isFront={isFront}
                webcamRef={webcamRef}
                onReady={onStreamReady}
                onError={onStreamError}
              />
            </div>
          </div>
        ) : (
          <LiveWebcam
            facingMode={facingMode}
            isFront={isFront}
            webcamRef={webcamRef}
            onReady={onStreamReady}
            onError={onStreamError}
          />
        )}

        {countdown !== null && <div className="fullscreen-camera__countdown">{countdown}</div>}

        {shutterFlash && (
          <div className="fullscreen-camera__flash" onAnimationEnd={() => setShutterFlash(false)} />
        )}

        {phase === 'processing' && (
          <div className="fullscreen-camera__processing">
            <span className="fullscreen-camera__spinner" />
            <p>{processingLabel ?? t('camera.processing')}</p>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="fullscreen-camera__top safe-top">
        {showPreview ? (
          <button
            type="button"
            className="fullscreen-camera__icon-btn"
            onClick={resetLive}
            disabled={processing}
            aria-label={t('camera.backToCamera')}
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button
            type="button"
            className="fullscreen-camera__icon-btn"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={t('common.close')}
          >
            <X size={22} />
          </button>
        )}
        <div className="flex-1" />
      </div>

      {/* Right toolbar — live only */}
      {showLive && (
        <div className="fullscreen-camera__toolbar safe-top">
          <button
            type="button"
            className="fullscreen-camera__icon-btn"
            onClick={handleFlip}
            aria-label={t('camera.flipCamera')}
          >
            <SwitchCamera size={22} />
          </button>

          {torchAvailable && (
            <button
              type="button"
              className={`fullscreen-camera__icon-btn ${torchOn ? 'fullscreen-camera__icon-btn--active' : ''}`}
              onClick={handleToggleTorch}
              aria-label={t('camera.torch')}
              aria-pressed={torchOn}
            >
              <Zap size={22} />
            </button>
          )}

          <button
            type="button"
            className={`fullscreen-camera__icon-btn ${timer !== 'off' ? 'fullscreen-camera__icon-btn--active' : ''}`}
            onClick={cycleTimer}
            aria-label={timerLabel(timer, t)}
          >
            <Timer size={22} />
            {timer !== 'off' && <span className="fullscreen-camera__timer-badge">{timer}</span>}
          </button>
        </div>
      )}

      {bottomOverlay}

      {/* Bottom controls */}
      <div className="fullscreen-camera__bottom safe-bottom">
        {showLive ? (
          <div className="fullscreen-camera__bottom-stack">
            <button
              type="button"
              className="fullscreen-camera__shutter"
              onClick={handleShutter}
              disabled={!cameraReady || countdown !== null || shutterDisabled}
              aria-label={t('profile.takePhoto')}
            />
            {showModeSwitcher && (
              <div className="fullscreen-camera__modes" role="tablist">
                {modeOptions!.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={captureMode === option.id}
                    className={`fullscreen-camera__mode-btn ${captureMode === option.id ? 'fullscreen-camera__mode-btn--active' : ''}`}
                    onClick={() => onCaptureModeChange!(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : showPreview ? (
          <button
            type="button"
            className="fullscreen-camera__continue"
            onClick={() => void handleConfirm()}
            disabled={processing || !capturedPhoto}
          >
            {processing ? (processingLabel ?? t('camera.processing')) : confirmLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

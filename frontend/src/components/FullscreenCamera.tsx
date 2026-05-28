import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, SwitchCamera, Timer, X, Zap } from 'lucide-react'
import Webcam from 'react-webcam'
import { captureVideoFrame } from '../lib/captureVideoFrame'
import { triggerCameraShutterFeedback } from '../lib/cameraShutter'
import { ensureCameraAccess, waitForLiveVideo } from '../lib/webCamera'
import { useOverlayTransition } from '../lib/useOverlayTransition'
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
  onConfirm: (photoBase64: string, burst?: string[]) => void | Promise<void>
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
  /** Tap outside bottom sheet / preview → e.g. leave remote selfie mode */
  onCancelRemote?: () => void
  shutterDisabled?: boolean
  /**
   * If > 1, the camera grabs a short burst of frames around the shutter press
   * (preview shows the primary, but all frames are passed to `onConfirm` as
   * a second argument). Useful for face-recognition where extra frames give
   * the recognizer more chances to find a usable pose.
   */
  burstFrames?: number
}

function timerLabel(timer: CameraTimer, t: (key: string) => string): string {
  if (timer === 3) return t('camera.timer3')
  if (timer === 10) return t('camera.timer10')
  return t('camera.timerOff')
}

function LiveWebcam({
  facingMode,
  mountKey,
  isFront,
  webcamRef,
  className,
  cameraReady,
  onReady,
  onError,
}: {
  facingMode: 'user' | 'environment'
  mountKey: number
  isFront: boolean
  webcamRef: React.RefObject<Webcam | null>
  className?: string
  cameraReady: boolean
  onReady: (stream: MediaStream) => void
  onError: (err: string | DOMException) => void
}) {
  return (
    <Webcam
      key={`${facingMode}-${mountKey}`}
      ref={webcamRef}
      audio={false}
      screenshotFormat="image/jpeg"
      forceScreenshotSourceSize
      videoConstraints={{
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }}
      className={`camera-video fullscreen-camera__media ${cameraReady ? 'camera-video--ready' : ''} ${isFront ? 'fullscreen-camera__media--mirror' : ''} ${className ?? ''}`}
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
  onCancelRemote,
  shutterDisabled = false,
  burstFrames = 1,
}: Props) {
  const { t } = useTranslation()
  const webcamRef = useRef<Webcam>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const burstRef = useRef<string[]>([])
  const lastTapRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const DOUBLE_TAP_MS = 320

  const [phase, setPhase] = useState<Phase>('live')
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [webcamMountKey, setWebcamMountKey] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [timer, setTimer] = useState<CameraTimer>('off')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [shutterFlash, setShutterFlash] = useState(false)

  const isFront = facingMode === 'user'
  const useSplit = !!splitTop && phase === 'live'
  const showModeSwitcher = !!(modeOptions?.length && onCaptureModeChange && phase === 'live')
  const { mounted, screenClass } = useOverlayTransition(open, 'slideUp', 360)

  const resetLive = useCallback(() => {
    setPhase('live')
    setCapturedPhoto(null)
    setCountdown(null)
    setShutterFlash(false)
    burstRef.current = []
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
      return
    }

    let cancelled = false
    setCameraReady(false)
    void (async () => {
      const ok = await ensureCameraAccess()
      if (cancelled) return
      if (ok) setWebcamMountKey((k) => k + 1)
      else toastError(t('face.cameraDenied'))
    })()

    return () => {
      cancelled = true
    }
  }, [open, resetLive, setTorch, t])

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
      const video = webcamRef.current?.video
      if (!video) {
        setCameraReady(true)
        return
      }
      void waitForLiveVideo(video).then((live) => {
        setCameraReady(live)
        if (!live) toastError(t('camera.notReady'))
      })
    },
    [inspectStream, t]
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
    burstRef.current = [imageSrc]
    setPhase('preview')
    setCountdown(null)

    // Grab a few additional frames silently to give the face recognizer extra
    // chances. We capture from the still-live video element; the preview UI is
    // already showing the primary frame.
    const extras = Math.max(0, burstFrames - 1)
    if (extras > 0) {
      let i = 0
      const grab = () => {
        if (i >= extras) return
        const v = webcamRef.current?.video
        if (!v) return
        const extra = captureVideoFrame(v, {
          minWidth: 960,
          quality: 0.9,
          mirror: isFront,
          enhance: false,
        })
        if (extra) burstRef.current.push(extra)
        i += 1
        if (i < extras) setTimeout(grab, 130)
      }
      setTimeout(grab, 130)
    }
  }, [isFront, t, burstFrames])

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

  const handleFlip = useCallback(() => {
    if (torchOn) void setTorch(false)
    setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))
    setCameraReady(false)
  }, [torchOn, setTorch])

  const handleViewportTap = useCallback(() => {
    const now = Date.now()
    const sinceLast = now - lastTapRef.current
    const dismissRemote =
      captureMode === 'remote' &&
      !!onCancelRemote &&
      phase === 'live' &&
      !processing &&
      !bottomOverlay

    if (sinceLast > 0 && sinceLast < DOUBLE_TAP_MS) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = null
      }
      lastTapRef.current = 0
      if (phase === 'live' && !processing && countdown === null) {
        handleFlip()
      }
      return
    }

    lastTapRef.current = now

    if (dismissRemote) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null
        lastTapRef.current = 0
        onCancelRemote?.()
      }, DOUBLE_TAP_MS)
    }
  }, [
    DOUBLE_TAP_MS,
    captureMode,
    onCancelRemote,
    phase,
    processing,
    bottomOverlay,
    countdown,
    handleFlip,
  ])

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
    }
  }, [])

  const handleToggleTorch = () => {
    if (!torchAvailable) return
    void setTorch(!torchOn)
  }

  async function handleConfirm() {
    if (!capturedPhoto || processing) return
    const burst = burstRef.current.length > 1 ? burstRef.current.slice() : undefined
    await onConfirm(capturedPhoto, burst)
  }

  if (!mounted) return null

  const showLive = phase === 'live'
  const showPreview = phase === 'preview' || phase === 'processing'
  const canCancelRemote =
    captureMode === 'remote' && !!onCancelRemote && showLive && !processing && !bottomOverlay

  return (
    <div className={`fullscreen-camera ${screenClass}`} style={{ height: '100dvh' }}>
      <div
        className={`fullscreen-camera__viewport${canCancelRemote ? ' fullscreen-camera__viewport--dismiss-remote' : ''}${showLive ? ' fullscreen-camera__viewport--flip-tap' : ''}`}
        onClick={showLive ? handleViewportTap : undefined}
      >
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
                mountKey={webcamMountKey}
                isFront={isFront}
                webcamRef={webcamRef}
                cameraReady={cameraReady}
                onReady={onStreamReady}
                onError={onStreamError}
              />
            </div>
          </div>
        ) : (
          <LiveWebcam
            facingMode={facingMode}
            mountKey={webcamMountKey}
            isFront={isFront}
            webcamRef={webcamRef}
            cameraReady={cameraReady}
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

      {bottomOverlay && onCancelRemote ? (
        <button
          type="button"
          className="fullscreen-camera__sheet-backdrop"
          aria-label={t('camera.backToMeet')}
          onClick={onCancelRemote}
        />
      ) : null}
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

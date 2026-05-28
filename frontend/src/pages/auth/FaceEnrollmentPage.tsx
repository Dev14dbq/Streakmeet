import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import { enrollFace, type AuthUser } from '../../lib/api'
import { captureVideoFrame } from '../../lib/captureVideoFrame'
import { toastError } from '../../lib/toast'
import i18n from '../../i18n'

type StepId =
  | 'center1'
  | 'smile'
  | 'lookUp'
  | 'lookDown'
  | 'turnRight'
  | 'turnLeft'
  | 'moveClose'
  | 'moveFar'

type Phase = 'loading' | 'intro' | StepId | 'saving' | 'done'

interface StepDef {
  id: StepId
  labelKey: string
  hintKey: string
  arrow: '←' | '→' | null
  check: (m: FaceMetrics) => boolean
}

interface FaceMetrics {
  yaw: number
  pitch: number
  boxWidthRatio: number
  detScore: number
}

const NEED_STABLE = 6
const NO_FACE_DELAY = 8

const STEPS: StepDef[] = [
  {
    id: 'center1',
    labelKey: 'face.lookStraight',
    hintKey: 'face.lookStraightHint',
    arrow: null,
    check: (m) => Math.abs(m.yaw) < 0.13 && Math.abs(m.pitch) < 0.12 && inFrameSize(m),
  },
  {
    id: 'smile',
    labelKey: 'face.smile',
    hintKey: 'face.smileHint',
    arrow: null,
    check: (m) => Math.abs(m.yaw) < 0.15 && Math.abs(m.pitch) < 0.15 && inFrameSize(m),
  },
  {
    id: 'lookUp',
    labelKey: 'face.lookUp',
    hintKey: 'face.lookUpHint',
    arrow: null,
    check: (m) => m.pitch < -0.08 && Math.abs(m.yaw) < 0.2 && inFrameSize(m),
  },
  {
    id: 'lookDown',
    labelKey: 'face.lookDown',
    hintKey: 'face.lookDownHint',
    arrow: null,
    check: (m) => m.pitch > 0.1 && Math.abs(m.yaw) < 0.2 && inFrameSize(m),
  },
  {
    id: 'turnRight',
    labelKey: 'face.turnRight',
    hintKey: 'face.turnRightHint',
    arrow: '→',
    check: (m) => m.yaw < -0.18 && m.yaw > -0.4 && inFrameSize(m),
  },
  {
    id: 'turnLeft',
    labelKey: 'face.turnLeft',
    hintKey: 'face.turnLeftHint',
    arrow: '←',
    check: (m) => m.yaw > 0.18 && m.yaw < 0.4 && inFrameSize(m),
  },
  {
    id: 'moveClose',
    labelKey: 'face.moveClose',
    hintKey: 'face.moveCloseHint',
    arrow: null,
    check: (m) => m.boxWidthRatio >= 0.38 && Math.abs(m.yaw) < 0.2,
  },
  {
    id: 'moveFar',
    labelKey: 'face.moveFar',
    hintKey: 'face.moveFarHint',
    arrow: null,
    check: (m) => m.boxWidthRatio >= 0.14 && m.boxWidthRatio <= 0.24 && Math.abs(m.yaw) < 0.2,
  },
]

function inFrameSize(m: FaceMetrics): boolean {
  return m.boxWidthRatio >= 0.18 && m.boxWidthRatio <= 0.55
}

function estimateYaw(lm: faceapi.FaceLandmarks68): number {
  const pts = lm.positions
  const lx = pts.slice(36, 42).reduce((s, p) => s + p.x, 0) / 6
  const rx = pts.slice(42, 48).reduce((s, p) => s + p.x, 0) / 6
  const w = rx - lx
  const nx = pts[30]!.x
  return w > 0 ? (nx - (lx + rx) / 2) / w : 0
}

function estimatePitch(lm: faceapi.FaceLandmarks68): number {
  const pts = lm.positions
  const eyeMidY = pts.slice(36, 48).reduce((s, p) => s + p.y, 0) / 12
  const mouthMidY = pts.slice(48, 60).reduce((s, p) => s + p.y, 0) / 12
  const noseY = pts[30]!.y
  const span = mouthMidY - eyeMidY
  if (span <= 1) return 0
  // ratio ~0.5 at neutral. Negative = looking up, positive = looking down.
  return (noseY - eyeMidY) / span - 0.5
}

function drawMesh(
  ctx: CanvasRenderingContext2D,
  lm: faceapi.FaceLandmarks68,
  mx: (x: number) => number,
  my: (y: number) => number,
  active: boolean
) {
  const pts = lm.positions
  ctx.strokeStyle = active ? 'rgba(255,26,79,0.7)' : 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1.4
  const poly = (ids: number[]) => {
    ctx.beginPath()
    ctx.moveTo(mx(pts[ids[0]!]!.x), my(pts[ids[0]!]!.y))
    for (let i = 1; i < ids.length; i++) ctx.lineTo(mx(pts[ids[i]!]!.x), my(pts[ids[i]!]!.y))
    ctx.stroke()
  }
  const ring = (ids: number[]) => {
    poly(ids)
    ctx.closePath()
    ctx.stroke()
  }
  poly([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  poly([17, 18, 19, 20, 21])
  poly([22, 23, 24, 25, 26])
  poly([27, 28, 29, 30])
  poly([31, 32, 33, 34, 35])
  ring([36, 37, 38, 39, 40, 41])
  ring([42, 43, 44, 45, 46, 47])
  ring([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59])
  ctx.fillStyle = active ? 'rgba(255,26,79,0.85)' : 'rgba(255,255,255,0.35)'
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(mx(p.x), my(p.y), active ? 2 : 1.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function SuccessScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black px-6 pb-safe">
      <div className="flex flex-col items-center flex-1 justify-center">
        <div className="enroll-success-circle mb-10">
          <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
            <circle
              cx="65"
              cy="65"
              r="58"
              stroke="#FF1A4F"
              strokeWidth="4"
              fill="rgba(255,26,79,0.1)"
            />
            <path
              className="enroll-success-check"
              d="M42 67 L58 83 L90 48"
              stroke="#FF1A4F"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <h2 className="enroll-success-label text-3xl font-extrabold text-white tracking-tight text-center">
          {t('face.registered')}
        </h2>
        <p className="enroll-success-label mt-3 text-sm text-[var(--color-on-surface-variant)] text-center max-w-xs">
          {t('settings.biometricDesc')}
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="enroll-success-btn w-full max-w-sm rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 mb-6"
      >
        {t('auth.continue')}
      </button>
    </div>
  )
}

function StepBar({ stepIndex, total }: { stepIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 w-full max-w-[290px]">
      {Array.from({ length: total }).map((_, i) => {
        const done = i < stepIndex
        const active = i === stepIndex
        return (
          <div
            key={i}
            className={[
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              done ? 'bg-[var(--color-brand-primary)]' : '',
              !done && active ? 'bg-[var(--color-brand-primary)] opacity-60 animate-pulse' : '',
              !done && !active ? 'bg-white/15' : '',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}

export default function FaceEnrollmentPage({
  onUserUpdate,
}: {
  onUserUpdate?: (user: AuthUser) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const autoStart = !!(location.state as { autoStart?: boolean } | null)?.autoStart
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [stepIndex, setStepIndex] = useState(0)
  const [statusMsg, setStatusMsg] = useState(() => i18n.t('face.loadingModels'))
  const [holdPct, setHoldPct] = useState(0)

  const phaseRef = useRef<Phase>('loading')
  const stepIndexRef = useRef(0)
  const photosRef = useRef<string[]>([])
  const stableRef = useRef(0)
  const noFaceRef = useRef(0)
  const loopRunning = useRef(false)
  const yawHistory = useRef<number[]>([])
  const pitchHistory = useRef<number[]>([])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    stepIndexRef.current = stepIndex
  }, [stepIndex])

  function handleStart() {
    photosRef.current = []
    stableRef.current = 0
    yawHistory.current = []
    pitchHistory.current = []
    setStepIndex(0)
    setPhase(STEPS[0]!.id)
    setStatusMsg(t(STEPS[0]!.hintKey))
    setHoldPct(0)
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        ])
        setModelsLoaded(true)
        if (autoStart) {
          handleStart()
        } else {
          setPhase('intro')
          setStatusMsg(t('face.pressStart'))
        }
      } catch {
        setStatusMsg(t('face.modelsError'))
      }
    })()
  }, []) // eslint-disable-line

  const isScanning = STEPS.some((s) => s.id === phase)

  useEffect(() => {
    if (!modelsLoaded || !isScanning) return
    startLoop()
    return () => {
      loopRunning.current = false
    }
  }, [modelsLoaded, isScanning]) // eslint-disable-line

  function startLoop() {
    if (loopRunning.current) return
    loopRunning.current = true
    void (async () => {
      while (loopRunning.current) {
        await tick()
        await new Promise<void>((r) => setTimeout(r, 130))
      }
    })()
  }

  function advance() {
    const next = stepIndexRef.current + 1
    const video = webcamRef.current?.video
    const shot = video ? captureVideoFrame(video, { minWidth: 720, quality: 0.92 }) : null
    if (shot) photosRef.current.push(shot)
    stableRef.current = 0
    yawHistory.current = []
    pitchHistory.current = []
    setHoldPct(0)

    if (next >= STEPS.length) {
      loopRunning.current = false
      setPhase('saving')
      setStatusMsg(t('face.saving'))
      void doSave()
    } else {
      setStepIndex(next)
      setPhase(STEPS[next]!.id)
      setStatusMsg(t(STEPS[next]!.hintKey))
    }
  }

  async function tick() {
    const video = webcamRef.current?.video
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    const cw = canvas.offsetWidth
    const ch = canvas.offsetHeight
    if (!cw || !ch) return
    canvas.width = cw
    canvas.height = ch

    const curPhase = phaseRef.current
    if (
      curPhase === 'saving' ||
      curPhase === 'done' ||
      curPhase === 'loading' ||
      curPhase === 'intro'
    )
      return

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
      .withFaceLandmarks()

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, cw, ch)

    if (!detection) {
      noFaceRef.current++
      if (noFaceRef.current >= NO_FACE_DELAY) {
        stableRef.current = 0
        setHoldPct(0)
        setStatusMsg(t('face.moveCloser'))
      }
      return
    }

    noFaceRef.current = 0
    const { landmarks, detection: det } = detection
    const box = det.box

    const scale = Math.max(cw / vw, ch / vh)
    const ox = (cw - vw * scale) / 2
    const oy = (ch - vh * scale) / 2
    const mx = (x: number) => x * scale + ox
    const my = (y: number) => y * scale + oy

    const rawYaw = estimateYaw(landmarks)
    const rawPitch = estimatePitch(landmarks)
    yawHistory.current = [...yawHistory.current.slice(-3), rawYaw]
    pitchHistory.current = [...pitchHistory.current.slice(-3), rawPitch]
    const yaw = yawHistory.current.reduce((a, b) => a + b, 0) / yawHistory.current.length
    const pitch = pitchHistory.current.reduce((a, b) => a + b, 0) / pitchHistory.current.length
    const metrics: FaceMetrics = {
      yaw,
      pitch,
      boxWidthRatio: box.width / vw,
      detScore: det.score,
    }

    const step = STEPS[stepIndexRef.current]!
    const ok = step.check(metrics)

    if (ok) {
      stableRef.current = Math.min(NEED_STABLE, stableRef.current + 1)
    } else {
      stableRef.current = Math.max(0, stableRef.current - 1)
    }

    const pct = stableRef.current / NEED_STABLE
    setHoldPct(pct)
    drawMesh(ctx, landmarks, mx, my, ok)

    if (ok) {
      setStatusMsg(t('face.hold', { percent: Math.round(pct * 100) }))
    } else {
      setStatusMsg(t(step.hintKey))
    }

    if (stableRef.current >= NEED_STABLE) {
      advance()
    }
  }

  async function doSave() {
    try {
      if (photosRef.current.length < 3) {
        throw new Error(t('face.saveFailed'))
      }
      await enrollFace(photosRef.current)
      const user = JSON.parse(localStorage.getItem('user') || '{}') as AuthUser
      user.faceEnrolled = true
      localStorage.setItem('user', JSON.stringify(user))
      onUserUpdate?.(user)
      setPhase('done')
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code
      const fallback =
        code === 'FACE_ENROLL_LOW_QUALITY' || code === 'FACE_ENROLL_TOO_FEW_FRAMES'
          ? t('face.lowQuality')
          : t('face.saveError')
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : fallback)
      toastError(msg)
      photosRef.current = []
      stableRef.current = 0
      yawHistory.current = []
      pitchHistory.current = []
      setHoldPct(0)
      setStepIndex(0)
      setPhase(STEPS[0]!.id)
      setStatusMsg(t(STEPS[0]!.hintKey))
      startLoop()
    }
  }

  if (phase === 'done') {
    return <SuccessScreen onContinue={() => navigate('/', { replace: true })} />
  }

  const currentStep = isScanning ? STEPS[stepIndex]! : null
  const scanning = !!currentStep

  return (
    <div className="flex min-h-screen flex-col bg-black px-6 pt-10 pb-safe">
      <div className="w-full max-w-[600px] mx-auto flex flex-col flex-1 items-center">
        <h2 className="text-2xl font-extrabold text-white tracking-tight text-center mb-1">
          {t('face.faceRecognition')}
        </h2>
        <p className="text-xs text-[var(--color-on-surface-variant)] text-center mb-5 max-w-xs">
          {scanning
            ? t('face.stepProgress', { current: stepIndex + 1, total: STEPS.length })
            : t('face.lookStraightHint')}
        </p>

        <div className="flex items-center justify-center gap-4 w-full flex-1 min-h-[280px]">
          <div className="flex items-center justify-center w-10">
            {currentStep?.arrow === '←' && (
              <span className="text-4xl font-black text-[var(--color-brand-primary)] animate-pulse select-none">
                ←
              </span>
            )}
          </div>

          <div
            className="relative rounded-full bg-[var(--color-surface-container-high)] shrink-0"
            style={{
              width: 'min(72vw, 290px)',
              height: 'min(72vw, 290px)',
              boxShadow: scanning
                ? '0 0 0 3px #FF1A4F, 0 0 40px rgba(255,26,79,0.2)'
                : '0 0 0 2px rgba(255,255,255,0.08)',
              transition: 'box-shadow 0.4s',
            }}
          >
            <div className="absolute inset-[22px] rounded-full overflow-hidden">
              {modelsLoaded ? (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  forceScreenshotSourceSize
                  videoConstraints={{
                    facingMode: 'user',
                    width: { ideal: 720 },
                    height: { ideal: 720 },
                  }}
                  className={`camera-video absolute inset-0 w-full h-full object-cover scale-x-[-1] ${cameraReady ? 'camera-video--ready' : ''}`}
                  onUserMedia={() => setCameraReady(true)}
                  onUserMediaError={(err) => {
                    setCameraReady(false)
                    setStatusMsg(
                      t('face.cameraError', {
                        message: typeof err === 'string' ? err : err.message,
                      })
                    )
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-5xl opacity-30 animate-pulse">👤</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none"
                style={{ zIndex: 10 }}
              />
              {phase === 'saving' && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <p className="text-white font-semibold text-sm animate-pulse">
                    {t('face.saving')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center w-10">
            {currentStep?.arrow === '→' && (
              <span className="text-4xl font-black text-[var(--color-brand-primary)] animate-pulse select-none">
                →
              </span>
            )}
          </div>
        </div>

        {scanning ? (
          <>
            <div className="mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden w-full max-w-[290px]">
              <div
                className="h-full bg-[var(--color-brand-primary)] rounded-full transition-all duration-150"
                style={{ width: `${holdPct * 100}%` }}
              />
            </div>

            {currentStep && (
              <p className="mt-3 text-lg font-extrabold text-[var(--color-brand-primary)] text-center tracking-tight">
                {t(currentStep.labelKey)}
              </p>
            )}

            <p className="mt-1 text-xs text-[var(--color-on-surface-variant)] text-center px-4 min-h-[2rem]">
              {statusMsg}
            </p>

            <div className="mt-4 w-full flex justify-center">
              <StepBar stepIndex={stepIndex} total={STEPS.length} />
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm text-[var(--color-on-surface-variant)] text-center px-4 min-h-[2rem]">
            {statusMsg}
          </p>
        )}

        <div className="w-full max-w-sm mt-auto pt-6 pb-2 flex flex-col gap-2">
          {phase === 'intro' && (
            <button
              type="button"
              onClick={handleStart}
              className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95"
            >
              {t('auth.continue')}
            </button>
          )}
          {phase !== 'saving' && !autoStart && (
            <button
              onClick={() => {
                loopRunning.current = false
                navigate(-1)
              }}
              className="w-full py-4 text-sm font-semibold text-[var(--color-on-surface-variant)] hover:text-white transition"
            >
              {phase === 'intro' ? t('face.skipLater') : t('common.cancel')}
            </button>
          )}
        </div>

        <p className="text-[10px] text-[var(--color-on-surface-variant)] text-center opacity-40 max-w-sm pb-4">
          {t('settings.biometricDesc')}
        </p>
      </div>
    </div>
  )
}

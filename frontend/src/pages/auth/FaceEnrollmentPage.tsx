import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import { enrollFace, type AuthUser } from '../../lib/api'
import { captureVideoFrame } from '../../lib/captureVideoFrame'
import { toastError } from '../../lib/toast'

type Phase = 'loading' | 'intro' | 'center' | 'right' | 'left' | 'saving' | 'done'

interface StepInfo {
  label: string
  hint: string
  arrow: string | null
  yawOk: (yaw: number) => boolean
  next: Phase
}

const STEPS: Record<Phase, StepInfo | null> = {
  loading: null,
  intro: null,
  done: null,
  saving: null,
  center: {
    label: 'Смотри прямо',
    hint: 'Держи голову ровно, смотри в камеру',
    arrow: null,
    yawOk: (y) => Math.abs(y) < 0.13,
    next: 'right',
  },
  right: {
    label: 'Медленно вправо →',
    hint: 'Поворачивай голову вправо, пока не заполнится полоса',
    arrow: '→',
    yawOk: (y) => y < -0.28,
    next: 'left',
  },
  left: {
    label: '← Медленно влево',
    hint: 'Теперь поворачивай голову влево',
    arrow: '←',
    yawOk: (y) => y > 0.28,
    next: 'saving',
  },
}

const NEED_STABLE = 7
const NO_FACE_DELAY = 8

function estimateYaw(lm: faceapi.FaceLandmarks68): number {
  const pts = lm.positions
  const lx = pts.slice(36, 42).reduce((s, p) => s + p.x, 0) / 6
  const rx = pts.slice(42, 48).reduce((s, p) => s + p.x, 0) / 6
  const w = rx - lx
  const nx = pts[30]!.x
  return w > 0 ? (nx - (lx + rx) / 2) / w : 0
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
          Готово!
        </h2>
        <p className="enroll-success-label mt-3 text-sm text-[var(--color-on-surface-variant)] text-center max-w-xs">
          Лицо зарегистрировано — теперь подтверждай встречи с друзьями
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="enroll-success-btn w-full max-w-sm rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 mb-6"
      >
        Перейти в приложение
      </button>
    </div>
  )
}

const ORDERED: Phase[] = ['center', 'right', 'left']
function StepDots({ phase, captured }: { phase: Phase; captured: Set<Phase> }) {
  return (
    <div className="flex items-center gap-3">
      {ORDERED.map((p) => {
        const done = captured.has(p)
        const active = phase === p
        return (
          <div
            key={p}
            className={[
              'rounded-full transition-all duration-300',
              done ? 'w-8 h-2 bg-[var(--color-brand-primary)]' : '',
              !done && active
                ? 'w-6 h-2 bg-[var(--color-brand-primary)] opacity-60 animate-pulse'
                : '',
              !done && !active ? 'w-2 h-2 bg-white/20' : '',
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
  const navigate = useNavigate()
  const location = useLocation()
  const autoStart = !!(location.state as { autoStart?: boolean } | null)?.autoStart
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [statusMsg, setStatusMsg] = useState('Загрузка моделей...')
  const [holdPct, setHoldPct] = useState(0)
  const [captured, setCaptured] = useState<Set<Phase>>(new Set())

  const phaseRef = useRef<Phase>('loading')
  const capturesRef = useRef<Float32Array[]>([])
  const photosRef = useRef<string[]>([])
  const capturedRef = useRef<Set<Phase>>(new Set())
  const stableRef = useRef(0)
  const noFaceRef = useRef(0)
  const loopRunning = useRef(false)
  const yawHistory = useRef<number[]>([])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  function handleStart() {
    capturesRef.current = []
    photosRef.current = []
    setPhase('center')
    setStatusMsg(STEPS.center!.hint)
    setHoldPct(0)
    stableRef.current = 0
    yawHistory.current = []
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ])
        setModelsLoaded(true)
        if (autoStart) {
          handleStart()
        } else {
          setPhase('intro')
          setStatusMsg('Нажми «Начать», когда будешь готов')
        }
      } catch {
        setStatusMsg('Ошибка загрузки моделей')
      }
    })()
  }, []) // eslint-disable-line

  const isScanning = phase === 'center' || phase === 'right' || phase === 'left'

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

  function advancePhase(p: Phase, descriptor: Float32Array) {
    capturesRef.current.push(descriptor)
    const video = webcamRef.current?.video
    const shot = video ? captureVideoFrame(video, { minWidth: 640, quality: 0.92 }) : null
    if (shot) photosRef.current.push(shot)
    capturedRef.current.add(p)
    setCaptured(new Set(capturedRef.current))
    stableRef.current = 0
    yawHistory.current = []
    setHoldPct(0)

    const next = STEPS[p]!.next
    if (next === 'saving') {
      loopRunning.current = false
      setPhase('saving')
      setStatusMsg('Сохранение...')
      void doSave()
    } else {
      setPhase(next)
      setStatusMsg(STEPS[next]!.hint)
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
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.28 }))
      .withFaceLandmarks()
      .withFaceDescriptor()

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, cw, ch)

    if (!detection) {
      noFaceRef.current++
      if (noFaceRef.current >= NO_FACE_DELAY) {
        stableRef.current = 0
        setHoldPct(0)
        setStatusMsg('Встань ближе и убери руки от лица')
      }
      return
    }

    noFaceRef.current = 0
    const { landmarks, descriptor, detection: det } = detection
    const box = det.box

    const scale = Math.max(cw / vw, ch / vh)
    const ox = (cw - vw * scale) / 2
    const oy = (ch - vh * scale) / 2
    const mx = (x: number) => x * scale + ox
    const my = (y: number) => y * scale + oy

    if (box.width / vw < 0.13) {
      stableRef.current = 0
      setHoldPct(0)
      setStatusMsg('Подойди чуть ближе к камере')
      drawMesh(ctx, landmarks, mx, my, false)
      return
    }

    const rawYaw = estimateYaw(landmarks)
    yawHistory.current = [...yawHistory.current.slice(-3), rawYaw]
    const yaw = yawHistory.current.reduce((a, b) => a + b, 0) / yawHistory.current.length

    const step = STEPS[curPhase]!
    const ok = step.yawOk(yaw)

    if (ok) {
      stableRef.current = Math.min(NEED_STABLE, stableRef.current + 1)
    } else {
      stableRef.current = Math.max(0, stableRef.current - 1)
    }

    const pct = stableRef.current / NEED_STABLE
    setHoldPct(pct)
    drawMesh(ctx, landmarks, mx, my, ok)

    if (ok) {
      setStatusMsg(`Держи... ${Math.round(pct * 100)}%`)
    } else {
      setStatusMsg(step.hint)
    }

    if (stableRef.current >= NEED_STABLE) {
      advancePhase(curPhase, descriptor)
    }
  }

  async function doSave() {
    try {
      if (photosRef.current.length < 3) {
        throw new Error('Не удалось сохранить все ракурсы — попробуй ещё раз')
      }
      await enrollFace(photosRef.current)
      const user = JSON.parse(localStorage.getItem('user') || '{}') as AuthUser
      user.faceEnrolled = true
      localStorage.setItem('user', JSON.stringify(user))
      onUserUpdate?.(user)
      setPhase('done')
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : 'Ошибка сохранения')
      toastError(msg)
      capturesRef.current = []
      photosRef.current = []
      capturedRef.current = new Set()
      setCaptured(new Set())
      stableRef.current = 0
      yawHistory.current = []
      setHoldPct(0)
      setPhase('center')
      setStatusMsg(STEPS.center!.hint)
      startLoop()
    }
  }

  if (phase === 'done') {
    return <SuccessScreen onContinue={() => navigate('/', { replace: true })} />
  }

  const stepInfo =
    phase !== 'loading' && phase !== 'saving' && phase !== 'intro' ? STEPS[phase] : null
  const scanning = phase === 'center' || phase === 'right' || phase === 'left'

  return (
    <div className="flex min-h-screen flex-col bg-black px-6 pt-10 pb-safe">
      <div className="w-full max-w-[600px] mx-auto flex flex-col flex-1 items-center">
        <h2 className="text-2xl font-extrabold text-white tracking-tight text-center mb-1">
          Зарегистрируй лицо
        </h2>
        <p className="text-xs text-[var(--color-on-surface-variant)] text-center mb-5 max-w-xs">
          3 ракурса — как Face ID. Система поймает всё сама.
        </p>

        <div className="flex items-center justify-center gap-4 w-full flex-1 min-h-[280px]">
          <div className="flex items-center justify-center w-10">
            {stepInfo?.arrow === '←' && (
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
                    width: { ideal: 640 },
                    height: { ideal: 640 },
                  }}
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                  onUserMediaError={(err) =>
                    setStatusMsg(`Ошибка камеры: ${typeof err === 'string' ? err : err.message}`)
                  }
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
                  <p className="text-white font-semibold text-sm animate-pulse">Сохранение...</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center w-10">
            {stepInfo?.arrow === '→' && (
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

            {stepInfo && (
              <p className="mt-3 text-lg font-extrabold text-[var(--color-brand-primary)] text-center tracking-tight">
                {stepInfo.label}
              </p>
            )}

            <p className="mt-1 text-xs text-[var(--color-on-surface-variant)] text-center px-4 min-h-[2rem]">
              {statusMsg}
            </p>

            <div className="mt-4">
              <StepDots phase={phase} captured={captured} />
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
              Начать
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
              {phase === 'intro' ? 'Пропустить (сделать позже)' : 'Отмена'}
            </button>
          )}
        </div>

        <p className="text-[10px] text-[var(--color-on-surface-variant)] text-center opacity-40 max-w-sm pb-4">
          Биометрические данные используются только для верификации встреч
        </p>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame } from 'lucide-react'

interface Props {
  leaving?: boolean
  onLeaveComplete?: () => void
}

export default function AppBootstrapScreen({ leaving = false, onLeaveComplete }: Props) {
  const { t } = useTranslation()
  const STEPS = [
    t('bootstrap.connecting'),
    t('bootstrap.loadingProfile'),
    t('bootstrap.streaksFriends'),
    t('bootstrap.preparing'),
  ]
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (leaving) return
    const timer = setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length)
    }, 900)
    return () => clearInterval(timer)
  }, [leaving, STEPS.length])

  return (
    <div
      className={`fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[var(--color-background)] px-8 ${
        leaving ? 'bootstrap-screen--leaving' : ''
      }`}
      onAnimationEnd={(e) => {
        if (leaving && e.animationName === 'bootstrap-leave') {
          onLeaveComplete?.()
        }
      }}
    >
      <div className="relative mb-8">
        <div className="absolute inset-0 m-auto h-28 w-28 rounded-full bg-[var(--color-brand-primary)] opacity-20 blur-3xl animate-pulse" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] ring-1 ring-white/10">
          <Flame
            size={44}
            className="text-[var(--color-brand-primary)] animate-pulse"
            fill="currentColor"
          />
        </div>
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight text-white">StreakMeet</h1>
      <p className="mt-3 min-h-[1.25rem] text-sm text-[var(--color-on-surface-variant)] transition-opacity duration-300">
        {STEPS[stepIndex]}
      </p>

      <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-[var(--color-surface-container-high)]">
        <div className="h-full w-1/3 rounded-full bg-[var(--color-brand-primary)] bootstrap-progress-bar" />
      </div>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Smartphone } from 'lucide-react'
import { requiresMobileGate } from '../lib/device'

interface Props {
  children: ReactNode
}

export default function MobileOnlyGate({ children }: Props) {
  const [blocked, setBlocked] = useState<boolean | null>(null)

  useEffect(() => {
    function update() {
      setBlocked(requiresMobileGate())
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  if (blocked === null) return null
  if (!blocked) return <>{children}</>

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="flex flex-col items-center text-center max-w-xs">
        <Smartphone
          size={48}
          className="text-[var(--color-brand-primary)] mb-6"
          strokeWidth={1.5}
        />
        <h1 className="text-xl font-bold text-white mb-2">Откройте с телефона</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
          StreakMeet доступен только на смартфоне
        </p>
      </div>
    </div>
  )
}

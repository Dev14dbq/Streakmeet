import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { requiresMobileGate } from '../lib/device'

interface Props {
  children: ReactNode
}

export default function MobileOnlyGate({ children }: Props) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [blocked, setBlocked] = useState<boolean | null>(null)

  useEffect(() => {
    function update() {
      setBlocked(requiresMobileGate(pathname))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [pathname])

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
        <h1 className="text-xl font-bold text-white mb-2">{t('mobileGate.title')}</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed">
          {t('mobileGate.description')}
        </p>
      </div>
    </div>
  )
}

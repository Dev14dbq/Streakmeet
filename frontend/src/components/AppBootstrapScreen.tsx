import { Flame } from 'lucide-react'

export default function AppBootstrapScreen() {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--color-background)]">
      <Flame
        size={52}
        className="text-[var(--color-brand-primary)] animate-pulse"
        fill="currentColor"
        aria-hidden
      />
    </div>
  )
}

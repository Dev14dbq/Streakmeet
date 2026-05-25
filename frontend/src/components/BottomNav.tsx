import { NavLink } from 'react-router-dom'
import { Flame, Map, Clapperboard, User } from 'lucide-react'
import GlobalCamera from './GlobalCamera'

const leftTabs = [
  { to: '/', icon: Flame, label: 'Дом', end: true },
  { to: '/map', icon: Map, label: 'Карта', end: false },
] as const

const rightTabs = [
  { to: '/memories', icon: Clapperboard, label: 'Лента', end: false },
  { to: '/profile', icon: User, label: 'Профиль', end: false },
] as const

function NavTab({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: typeof Flame
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition active:scale-95 min-w-0"
    >
      {({ isActive }) => (
        <>
          <Icon
            size={22}
            strokeWidth={isActive ? 2.5 : 2}
            className={isActive ? 'text-[#FF1A4F]' : 'text-[#8E8E93]'}
            style={{
              filter: isActive ? 'drop-shadow(0 0 10px rgba(255, 26, 79, 0.35))' : 'none',
            }}
          />
          <span
            className={`text-[10px] font-semibold tracking-wide ${
              isActive ? 'text-[#FF1A4F]' : 'text-[#8E8E93]'
            }`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[420px] pointer-events-auto">
        <div className="relative h-[76px]">
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-3">
            <GlobalCamera variant="center" />
          </div>

          <div className="absolute inset-x-0 bottom-0 h-[60px] glass-nav rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.55)] flex items-stretch px-1">
            <div className="flex flex-1 items-center min-w-0">
              {leftTabs.map((tab) => (
                <NavTab key={tab.to} {...tab} />
              ))}
            </div>
            <div className="w-[76px] shrink-0" aria-hidden />
            <div className="flex flex-1 items-center min-w-0">
              {rightTabs.map((tab) => (
                <NavTab key={tab.to} {...tab} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

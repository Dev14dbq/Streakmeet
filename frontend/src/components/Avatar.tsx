import CachedImage from './CachedImage'
import { avatarInitial } from '../lib/avatarInitial'

interface Props {
  path?: string | null
  /** Nickname or display name — first letter shown when no photo */
  name?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const sizes = {
  sm: { box: 'w-12 h-12', text: 'text-lg' },
  md: { box: 'w-14 h-14', text: 'text-xl' },
  lg: { box: 'w-16 h-16', text: 'text-2xl' },
  xl: { box: 'w-[72px] h-[72px]', text: 'text-2xl' },
  '2xl': { box: 'w-28 h-28', text: 'text-4xl' },
}

export default function Avatar({ path, name, size = 'md', className = '' }: Props) {
  const { box, text } = sizes[size]
  const shell = `${box} rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shadow-inner border border-white/5 overflow-hidden shrink-0 ${className}`
  const initial = avatarInitial(name)

  return (
    <div className={shell}>
      {path ? (
        <CachedImage path={path} alt="" className="w-full h-full object-cover" />
      ) : (
        <span
          className={`${text} font-bold text-[var(--color-brand-primary)] select-none leading-none`}
          aria-hidden
        >
          {initial}
        </span>
      )}
    </div>
  )
}

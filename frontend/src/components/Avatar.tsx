import CachedImage from './CachedImage'

interface Props {
  path?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'w-12 h-12',
  md: 'w-14 h-14',
  lg: 'w-16 h-16',
  xl: 'w-[72px] h-[72px]',
}

export default function Avatar({ path, size = 'md', className = '' }: Props) {
  const shell = `${sizes[size]} rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shadow-inner border border-white/5 overflow-hidden shrink-0 ${className}`

  return (
    <div className={shell}>
      {path ? (
        <CachedImage path={path} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={size === 'lg' || size === 'xl' ? 'text-2xl' : 'text-xl'}>👤</span>
      )}
    </div>
  )
}

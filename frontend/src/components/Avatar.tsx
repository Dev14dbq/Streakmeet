import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { useCachedImageSrc } from '../lib/useCachedImageSrc'
import { avatarInitial } from '../lib/avatarInitial'

interface Props {
  path?: string | null
  /** Nickname or display name — first letter shown when no photo */
  name?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const sizes = {
  sm: { box: 'w-12 h-12', text: 'text-lg', icon: 20 },
  md: { box: 'w-14 h-14', text: 'text-xl', icon: 22 },
  lg: { box: 'w-16 h-16', text: 'text-2xl', icon: 26 },
  xl: { box: 'w-[72px] h-[72px]', text: 'text-2xl', icon: 28 },
  '2xl': { box: 'w-28 h-28', text: 'text-4xl', icon: 40 },
}

export default function Avatar({ path, name, size = 'md', className = '' }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const { box, text, icon } = sizes[size]
  const shell = `${box} rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shadow-inner border border-white/5 overflow-hidden shrink-0 ${className}`
  const initial = avatarInitial(name)
  const showImage = Boolean(path) && !imgFailed
  const src = useCachedImageSrc(showImage ? path : null)

  useEffect(() => {
    setImgFailed(false)
  }, [path])

  return (
    <div className={shell}>
      {showImage && src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : initial ? (
        <span
          className={`${text} font-bold text-[var(--color-brand-primary)] select-none leading-none`}
          aria-hidden
        >
          {initial}
        </span>
      ) : (
        <User
          size={icon}
          className="text-[var(--color-on-surface-variant)] opacity-70"
          aria-hidden
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useCachedImageSrc } from '../lib/useCachedImageSrc'

interface Props {
  path?: string | null
  alt?: string
  className?: string
  loading?: 'eager' | 'lazy'
  /** empty — keep layout only; icon — show unavailable placeholder (default) */
  fallback?: 'empty' | 'icon'
}

export default function CachedImage({
  path,
  alt = '',
  className = '',
  loading,
  fallback = 'icon',
}: Props) {
  const src = useCachedImageSrc(path)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [path])

  if (!path || !src || failed) {
    if (fallback === 'empty') {
      return <div className={className} aria-hidden />
    }
    return (
      <div
        className={`${className} bg-[var(--color-surface-container-high)] flex items-center justify-center`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
      >
        <ImageOff
          size={24}
          className="text-[var(--color-on-surface-variant)] opacity-40"
          aria-hidden
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  )
}

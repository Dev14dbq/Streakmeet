import { useCachedImageSrc } from '../lib/useCachedImageSrc'

interface Props {
  path?: string | null
  alt?: string
  className?: string
  loading?: 'eager' | 'lazy'
}

export default function CachedImage({ path, alt = '', className, loading }: Props) {
  const src = useCachedImageSrc(path)
  if (!src) return null
  return <img src={src} alt={alt} className={className} loading={loading} />
}

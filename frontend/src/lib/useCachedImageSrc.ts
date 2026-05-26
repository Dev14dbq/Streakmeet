import { useEffect, useState } from 'react'
import { getCachedImageSrc } from './remoteImageCache'
import { resolveBackendImageUrl } from './remoteImageUrl'

export function useCachedImageSrc(path: string | null | undefined): string | null {
  const fallback = path ? resolveBackendImageUrl(path) : null
  const [src, setSrc] = useState<string | null>(fallback)

  useEffect(() => {
    if (!path) {
      setSrc(null)
      return
    }

    let cancelled = false
    setSrc(resolveBackendImageUrl(path))

    void getCachedImageSrc(path).then((cached) => {
      if (!cancelled && cached) setSrc(cached)
    })

    return () => {
      cancelled = true
    }
  }, [path])

  return src
}

export function useCachedImageSrcMap(
  paths: Array<string | null | undefined>
): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const unique = [...new Set(paths.filter(Boolean) as string[])]
    if (unique.length === 0) {
      setMap({})
      return
    }

    let cancelled = false

    void Promise.all(
      unique.map(async (path) => {
        const src = await getCachedImageSrc(path)
        return [path, src] as const
      })
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [path, src] of entries) {
        if (src) next[path] = src
      }
      setMap(next)
    })

    return () => {
      cancelled = true
    }
  }, [paths.join('|')])

  return map
}

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { resolveBackendImageUrl } from './remoteImageUrl'

const INDEX_KEY = 'streakmeet_remote_image_cache_v1'
const CACHE_DIR = 'backend-images'
const IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type CacheEntry = {
  fileName: string
  lastUsedAt: number
  cachedAt: number
}

type CacheIndex = Record<string, CacheEntry>

const pending = new Map<string, Promise<string | null>>()

function cacheKey(backendPath: string): string {
  return backendPath.replace(/^\//, '')
}

function simpleHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function fileNameForKey(key: string): string {
  const extMatch = key.match(/\.(jpe?g|png|webp|gif|avif)$/i)
  const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg'
  const base = key.replace(/\.(jpe?g|png|webp|gif|avif)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${base.slice(-72)}_${simpleHash(key)}${ext}`
}

function readIndex(): CacheIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as CacheIndex) : {}
  } catch {
    return {}
  }
}

function writeIndex(index: CacheIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

async function ensureCacheDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: CACHE_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    /* already exists */
  }
}

async function localDisplayUri(fileName: string): Promise<string> {
  const { uri } = await Filesystem.getUri({
    path: `${CACHE_DIR}/${fileName}`,
    directory: Directory.Data,
  })
  return Capacitor.convertFileSrc(uri)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('read_failed'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
}

async function downloadAndCache(backendPath: string, remoteUrl: string): Promise<string | null> {
  await ensureCacheDir()

  const response = await fetch(remoteUrl)
  if (!response.ok) return remoteUrl

  const blob = await response.blob()
  const base64 = await blobToBase64(blob)
  const key = cacheKey(backendPath)
  const fileName = fileNameForKey(key)
  const now = Date.now()

  await Filesystem.writeFile({
    path: `${CACHE_DIR}/${fileName}`,
    data: base64,
    directory: Directory.Data,
  })

  const index = readIndex()
  index[key] = { fileName, lastUsedAt: now, cachedAt: now }
  writeIndex(index)

  return localDisplayUri(fileName)
}

async function resolveNativeCachedSrc(backendPath: string): Promise<string | null> {
  const remoteUrl = resolveBackendImageUrl(backendPath)
  if (!remoteUrl) return null

  const key = cacheKey(backendPath)
  const index = readIndex()
  const entry = index[key]
  const now = Date.now()

  if (entry) {
    try {
      await Filesystem.stat({
        path: `${CACHE_DIR}/${entry.fileName}`,
        directory: Directory.Data,
      })
      entry.lastUsedAt = now
      index[key] = entry
      writeIndex(index)
      return localDisplayUri(entry.fileName)
    } catch {
      delete index[key]
      writeIndex(index)
    }
  }

  return downloadAndCache(backendPath, remoteUrl)
}

export async function getCachedImageSrc(
  backendPath: string | null | undefined
): Promise<string | null> {
  if (!backendPath) return null

  const remoteUrl = resolveBackendImageUrl(backendPath)
  if (!remoteUrl) return null

  if (!Capacitor.isNativePlatform()) return remoteUrl

  const key = cacheKey(backendPath)
  const existing = pending.get(key)
  if (existing) return existing

  const task = resolveNativeCachedSrc(backendPath)
    .catch(() => remoteUrl)
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, task)
  return task
}

export async function invalidateCachedImage(backendPath: string | null | undefined): Promise<void> {
  if (!backendPath || !Capacitor.isNativePlatform()) return

  const key = cacheKey(backendPath)
  pending.delete(key)

  const index = readIndex()
  const entry = index[key]
  if (!entry) return

  try {
    await Filesystem.deleteFile({
      path: `${CACHE_DIR}/${entry.fileName}`,
      directory: Directory.Data,
    })
  } catch {
    /* missing file */
  }

  delete index[key]
  writeIndex(index)
}

export async function pruneStaleImageCache(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const index = readIndex()
  const now = Date.now()
  let changed = false

  for (const [key, entry] of Object.entries(index)) {
    if (now - entry.lastUsedAt <= IDLE_TTL_MS) continue

    try {
      await Filesystem.deleteFile({
        path: `${CACHE_DIR}/${entry.fileName}`,
        directory: Directory.Data,
      })
    } catch {
      /* missing file */
    }

    delete index[key]
    changed = true
  }

  if (changed) writeIndex(index)
}

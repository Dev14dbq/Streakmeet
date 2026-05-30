/**
 * Resolves whether Connect sync + Rust REST gateway are active.
 * VITE_USE_SYNC_STREAM: true | false | auto (default auto).
 */

const PROBE_CACHE_KEY = 'streakmeet:rustProbe'
const PROBE_TTL_MS = 60_000

type ProbeCache = { ok: boolean; at: number }

let resolved = false
let syncEnabled = false
const readyListeners = new Set<() => void>()

function envFlag(): string {
  return (
    (import.meta.env.VITE_USE_SYNC_STREAM as string | undefined)?.trim().toLowerCase() ?? 'auto'
  )
}

function readProbeCache(): boolean | null {
  try {
    const raw = sessionStorage.getItem(PROBE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ProbeCache
    if (Date.now() - parsed.at > PROBE_TTL_MS) return null
    return parsed.ok
  } catch {
    return null
  }
}

function writeProbeCache(ok: boolean): void {
  try {
    sessionStorage.setItem(
      PROBE_CACHE_KEY,
      JSON.stringify({ ok, at: Date.now() } satisfies ProbeCache)
    )
  } catch {
    /* ignore */
  }
}

function rustApiHealthUrl(): string | null {
  const gateway = import.meta.env.VITE_RUST_GATEWAY_URL as string | undefined
  if (gateway?.trim()) return `${gateway.replace(/\/$/, '')}/health`
  if (import.meta.env.DEV) return 'http://127.0.0.1:8080/health'
  return null
}

function syncGatewayHealthUrl(): string | null {
  const connect = import.meta.env.VITE_CONNECT_URL as string | undefined
  if (connect?.startsWith('http')) return `${connect.replace(/\/$/, '')}/health`
  if (import.meta.env.DEV) return 'http://127.0.0.1:8081/health'
  return null
}

async function probeUrl(url: string, ms: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' })
    if (!res.ok) return false
    const body = await res.text()
    return body.trim() === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function probeRustStack(): Promise<boolean> {
  const cached = readProbeCache()
  if (cached !== null) return cached

  const apiHealth = rustApiHealthUrl()
  const syncHealth = syncGatewayHealthUrl()
  if (!apiHealth || !syncHealth) {
    writeProbeCache(false)
    return false
  }

  const [apiOk, syncOk] = await Promise.all([
    probeUrl(apiHealth, 2_500),
    probeUrl(syncHealth, 2_500),
  ])
  const ok = apiOk && syncOk
  writeProbeCache(ok)
  return ok
}

function setResolved(enabled: boolean): void {
  resolved = true
  syncEnabled = enabled
  for (const fn of readyListeners) fn()
}

/** Call once before bootstrap / sync hooks (idempotent). */
export async function initSyncMode(): Promise<boolean> {
  if (resolved) return syncEnabled

  const flag = envFlag()
  if (flag === 'false' || flag === '0' || flag === 'no') {
    setResolved(false)
    return false
  }
  if (flag === 'true' || flag === '1' || flag === 'yes') {
    setResolved(true)
    return true
  }

  const ok = await probeRustStack()
  setResolved(ok)
  return ok
}

export function isSyncModeResolved(): boolean {
  return resolved
}

export function isSyncStreamEnabled(): boolean {
  const flag = envFlag()
  if (flag === 'false' || flag === '0' || flag === 'no') return false
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  if (resolved) return syncEnabled
  return false
}

export function onSyncModeReady(listener: () => void): () => void {
  readyListeners.add(listener)
  if (resolved) listener()
  return () => readyListeners.delete(listener)
}

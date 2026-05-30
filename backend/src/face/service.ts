const FACE_SERVICE_URL = (process.env.FACE_SERVICE_URL ?? 'http://127.0.0.1:8001').replace(
  /\/$/,
  ''
)

/**
 * Cosine-similarity thresholds for antelopev2 / glintr100 ArcFace embeddings.
 * Empirically a value of 0.42 gives ~1% FAR with high TAR for verification.
 * For partner-matching inside group photos we relax it because the partner
 * may be at an angle, distant, or partially occluded.
 */
export const FACE_MATCH_THRESHOLD_SELF = Number(process.env.FACE_MATCH_THRESHOLD_SELF ?? '0.42')
export const FACE_MATCH_THRESHOLD_PARTNER = Number(
  process.env.FACE_MATCH_THRESHOLD_PARTNER ?? '0.38'
)

export const CURRENT_FACE_MODEL = process.env.FACE_MODEL_TAG ?? 'antelopev2:v1'
export const EMBEDDING_DIM = 512

export interface FaceQuality {
  embedding: number[]
  det_score: number
  yaw: number
  pitch: number
  blur_var: number
  brightness: number
  face_px: number
  bbox: number[]
}

interface DetectFacesResponse {
  faces: FaceQuality[]
  width: number
  height: number
  model: string
}

interface EmbedFaceResponse extends FaceQuality {}

interface BurstResultItem {
  index: number
  face: FaceQuality | null
  error: string | null
}

interface BurstResponse {
  results: BurstResultItem[]
  model: string
}

async function faceServicePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FACE_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })

  const data = (await res.json().catch(() => ({}))) as { detail?: string; error?: string }

  if (!res.ok) {
    const msg = data.detail ?? data.error ?? `Face service error (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  return data as T
}

export async function ensureFaceService(): Promise<void> {
  const res = await fetch(`${FACE_SERVICE_URL}/health`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`Face service unhealthy (${res.status})`)
  const data = (await res.json()) as { model_loaded?: boolean }
  if (!data.model_loaded) throw new Error('Face service model not loaded yet')
}

export async function detectFacesFromBase64(photoBase64: string): Promise<FaceQuality[]> {
  const t0 = Date.now()
  const data = await faceServicePost<DetectFacesResponse>('/detect-faces', {
    image_base64: photoBase64,
  })
  console.log(
    `[face] detect ${data.width}x${data.height} -> ${data.faces.length} face(s) (+${Date.now() - t0}ms)`
  )
  return data.faces
}

export async function embedFaceFromBase64(photoBase64: string): Promise<FaceQuality> {
  const data = await faceServicePost<EmbedFaceResponse>('/embed-face', {
    image_base64: photoBase64,
  })
  return data
}

export async function embedBurstFromBase64(photos: string[]): Promise<BurstResultItem[]> {
  if (photos.length === 0) return []
  const t0 = Date.now()
  const data = await faceServicePost<BurstResponse>('/embed-burst', {
    images_base64: photos,
  })
  const ok = data.results.filter((r) => r.face !== null).length
  console.log(`[face] burst ${photos.length} -> ${ok} ok (+${Date.now() - t0}ms)`)
  return data.results
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

export interface MatchResult {
  bestSim: number
  bestIdx: number
}

/** Return best cosine similarity between `probe` and each vector in the gallery. */
export function matchAgainstGallery(probe: number[], gallery: number[][]): MatchResult {
  let bestSim = -Infinity
  let bestIdx = -1
  for (let i = 0; i < gallery.length; i++) {
    const sim = cosineSimilarity(probe, gallery[i]!)
    if (sim > bestSim) {
      bestSim = sim
      bestIdx = i
    }
  }
  if (bestIdx === -1) return { bestSim: -1, bestIdx: -1 }
  return { bestSim, bestIdx }
}

export interface FaceVsGalleryResult {
  faceIndex: number
  galleryIndex: number
  sim: number
}

/** For each detected face, find best vector in user gallery; return global maximum. */
export function bestFaceMatchInGallery(
  probes: number[][],
  gallery: number[][]
): FaceVsGalleryResult {
  let best: FaceVsGalleryResult = { faceIndex: -1, galleryIndex: -1, sim: -1 }
  for (let i = 0; i < probes.length; i++) {
    const m = matchAgainstGallery(probes[i]!, gallery)
    if (m.bestSim > best.sim) {
      best = { faceIndex: i, galleryIndex: m.bestIdx, sim: m.bestSim }
    }
  }
  return best
}

export function isValidEmbedding(embedding: unknown): embedding is number[] {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIM
}

/** Quality gate for accepting an embedding during enrollment. */
export interface QualityThresholds {
  minDetScore: number
  minBlurVar: number
  maxYawAbs: number
  maxPitchAbs: number
  minBrightness: number
  maxBrightness: number
}

export const ENROLL_QUALITY: QualityThresholds = {
  minDetScore: 0.7,
  minBlurVar: 60,
  maxYawAbs: 0.5,
  maxPitchAbs: 0.4,
  minBrightness: 35,
  maxBrightness: 240,
}

export function passesEnrollQuality(
  face: FaceQuality,
  t: QualityThresholds = ENROLL_QUALITY
): {
  ok: boolean
  reason?: string
} {
  if (face.det_score < t.minDetScore) return { ok: false, reason: 'low_det_score' }
  if (face.blur_var < t.minBlurVar) return { ok: false, reason: 'blurry' }
  if (Math.abs(face.yaw) > t.maxYawAbs) return { ok: false, reason: 'too_much_yaw' }
  if (Math.abs(face.pitch) > t.maxPitchAbs) return { ok: false, reason: 'too_much_pitch' }
  if (face.brightness < t.minBrightness) return { ok: false, reason: 'too_dark' }
  if (face.brightness > t.maxBrightness) return { ok: false, reason: 'too_bright' }
  if (face.embedding.length !== EMBEDDING_DIM) return { ok: false, reason: 'bad_embedding_dim' }
  return { ok: true }
}

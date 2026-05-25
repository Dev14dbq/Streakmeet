const FACE_SERVICE_URL = (process.env.FACE_SERVICE_URL ?? 'http://127.0.0.1:8001').replace(
  /\/$/,
  ''
)
const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? '0.35')
const EMBEDDING_DIM = 512

export interface FaceDetection {
  embedding: number[]
  det_score?: number
  bbox?: number[]
}

interface FaceServiceFacesResponse {
  faces: FaceDetection[]
  width: number
  height: number
}

interface FaceServiceEmbedResponse {
  embedding: number[]
  det_score: number
}

async function faceServicePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FACE_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
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

export async function detectFacesFromBase64(photoBase64: string): Promise<FaceDetection[]> {
  const t0 = Date.now()
  console.log('[face] detectFacesFromBase64 via InsightFace')

  const data = await faceServicePost<FaceServiceFacesResponse>('/detect-faces', {
    image_base64: photoBase64,
  })

  console.log(
    `[face] ${data.width}x${data.height} -> ${data.faces.length} face(s) (+${Date.now() - t0}ms)`
  )
  return data.faces
}

export async function embedFaceFromBase64(photoBase64: string): Promise<FaceDetection> {
  const data = await faceServicePost<FaceServiceEmbedResponse>('/embed-face', {
    image_base64: photoBase64,
  })
  return { embedding: data.embedding, det_score: data.det_score }
}

export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) throw new Error('No embeddings to average')
  const dim = embeddings[0]!.length
  const avg = new Array(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) avg[i]! += emb[i]!
  }
  const mean = avg.map((v) => v / embeddings.length)
  const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0))
  if (norm === 0) throw new Error('Zero-norm embedding')
  return mean.map((v) => v / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

export function isFaceMatch(a: number[], b: number[]): boolean {
  return cosineSimilarity(a, b) >= MATCH_THRESHOLD
}

export function isLegacyEmbedding(embedding: number[]): boolean {
  return embedding.length !== EMBEDDING_DIM
}

export function legacyEmbeddingMessage(): string {
  return 'Нужно перерегистрировать лицо — мы обновили систему распознавания'
}

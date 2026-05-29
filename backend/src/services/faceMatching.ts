import { detectFacesFromBase64, type FaceQuality } from '../lib/face.js'

export const MAGIC_MEET_MAX_FRAMES = 5

export interface FaceCandidate {
  frameIndex: number
  faceIndexInFrame: number
  embedding: number[]
  detScore: number
  bboxArea: number
}

export interface PhotoInput {
  photoBase64?: string
  photosBase64?: string[]
}

export function normalizePhotos(input: PhotoInput): string[] {
  if (Array.isArray(input.photosBase64) && input.photosBase64.length > 0) {
    return input.photosBase64.slice(0, MAGIC_MEET_MAX_FRAMES)
  }
  if (typeof input.photoBase64 === 'string' && input.photoBase64.length > 0) {
    return [input.photoBase64]
  }
  return []
}

export async function collectFaceCandidates(photos: string[]): Promise<FaceCandidate[]> {
  const out: FaceCandidate[] = []
  for (let frameIdx = 0; frameIdx < photos.length; frameIdx++) {
    const photo = photos[frameIdx]!
    const detections: FaceQuality[] = await detectFacesFromBase64(photo)
    for (let i = 0; i < detections.length; i++) {
      const d = detections[i]!
      const [x1, y1, x2, y2] = d.bbox
      out.push({
        frameIndex: frameIdx,
        faceIndexInFrame: i,
        embedding: d.embedding,
        detScore: d.det_score,
        bboxArea: Math.max(0, (x2! - x1!) * (y2! - y1!)),
      })
    }
  }
  return out
}

/** Pick the frame with the highest sum of det_score that contains the user's face. */
export function pickBestFrame(pool: FaceCandidate[], userCandidateIdx: number): number | null {
  if (pool.length === 0) return null
  const userFrame = pool[userCandidateIdx]?.frameIndex
  const scoreByFrame = new Map<number, number>()
  for (const c of pool) {
    scoreByFrame.set(c.frameIndex, (scoreByFrame.get(c.frameIndex) ?? 0) + c.detScore)
  }
  if (userFrame !== undefined && scoreByFrame.has(userFrame)) return userFrame
  let bestFrame = pool[0]!.frameIndex
  let bestScore = -Infinity
  for (const [f, s] of scoreByFrame) {
    if (s > bestScore) {
      bestScore = s
      bestFrame = f
    }
  }
  return bestFrame
}

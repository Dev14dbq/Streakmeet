import { prisma } from '../../lib/prisma.js'
import {
  CURRENT_FACE_MODEL,
  embedBurstFromBase64,
  ensureFaceService,
  passesEnrollQuality,
} from '../../lib/face.js'
import { faceErrorFromException, ErrorCodes } from '../../lib/apiErrors.js'
import { AuthServiceError } from './errors.js'

const MIN_INPUT_FRAMES = 3
const MAX_INPUT_FRAMES = 16
const MIN_ACCEPTED_EMBEDDINGS = 4

export async function enrollFace(
  userId: string,
  photos: unknown
): Promise<{ success: true; accepted: number; total: number }> {
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    throw new AuthServiceError(400, ErrorCodes.PHOTOS_REQUIRED)
  }
  if (photos.length < MIN_INPUT_FRAMES || photos.length > MAX_INPUT_FRAMES) {
    throw new AuthServiceError(400, ErrorCodes.FACE_ENROLL_TOO_FEW_FRAMES)
  }
  for (const photo of photos) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
      throw new AuthServiceError(400, ErrorCodes.INVALID_PHOTO)
    }
  }

  try {
    await ensureFaceService()
    const results = await embedBurstFromBase64(photos as string[])

    const accepted: {
      vector: number[]
      detScore: number
      yaw: number
      pitch: number
      blurVar: number
    }[] = []
    const reasons: Record<string, number> = {}

    for (const r of results) {
      if (!r.face) {
        const k = r.error ?? 'no_face'
        reasons[k] = (reasons[k] ?? 0) + 1
        continue
      }
      const q = passesEnrollQuality(r.face)
      if (!q.ok) {
        reasons[q.reason ?? 'low_quality'] = (reasons[q.reason ?? 'low_quality'] ?? 0) + 1
        continue
      }
      accepted.push({
        vector: r.face.embedding,
        detScore: r.face.det_score,
        yaw: r.face.yaw,
        pitch: r.face.pitch,
        blurVar: r.face.blur_var,
      })
    }

    console.log(
      `[enroll-face] user=${userId} frames=${photos.length} accepted=${accepted.length} reasons=${JSON.stringify(reasons)}`
    )

    if (accepted.length < MIN_ACCEPTED_EMBEDDINGS) {
      throw new AuthServiceError(400, ErrorCodes.FACE_ENROLL_LOW_QUALITY, undefined, {
        accepted: accepted.length,
        needed: MIN_ACCEPTED_EMBEDDINGS,
        reasons,
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.faceEmbedding.deleteMany({ where: { userId } })
      await tx.faceEmbedding.createMany({
        data: accepted.map((a) => ({
          userId,
          vector: a.vector,
          detScore: a.detScore,
          yaw: a.yaw,
          pitch: a.pitch,
          blurVar: a.blurVar,
          faceModel: CURRENT_FACE_MODEL,
          source: 'enrollment',
        })),
      })
      await tx.user.update({
        where: { id: userId },
        data: {
          faceEnrolled: true,
          faceModel: CURRENT_FACE_MODEL,
          faceEnrolledAt: new Date(),
        },
      })
    })

    return { success: true, accepted: accepted.length, total: photos.length }
  } catch (e) {
    if (e instanceof AuthServiceError) throw e
    console.error('[enroll-face]', e)
    const { code, message } = faceErrorFromException(e)
    throw new AuthServiceError(500, code, message)
  }
}

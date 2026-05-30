import { prisma } from '../db/client.js'
import { computePhotoHash } from '../storage/images.js'
import {
  bestFaceMatchInGallery,
  ensureFaceService,
  FACE_MATCH_THRESHOLD_SELF,
  isValidEmbedding,
} from '../face/service.js'
import { collectFaceCandidates, pickBestFrame, type FaceCandidate } from '../face/matching.js'
import { matchPartners, persistMatches, type MagicMeetPartner } from './meet.js'
import { ErrorCodes, faceErrorFromException } from '../common/errors.js'
import { ApiHttpError } from '../common/errors.js'

/** max frames accepted for burst mode */
const MAGIC_MEET_MAX_FRAMES = 5

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

export interface MagicMeetInput {
  photoBase64?: string
  photosBase64?: string[]
  location?: { lat: number; lng: number }
}

export interface MagicMeetResult {
  extended: MagicMeetPartner[]
  added: MagicMeetPartner[]
  skippedDuplicates: string[]
  partners: MagicMeetPartner[]
}

// ── Private helpers ───────────────────────────────────────────────────────────

function validateMagicMeetInput(photos: string[]): void {
  if (photos.length === 0) {
    console.log('[magic-meet] rejected: no photo')
    throw new ApiHttpError(400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
  }
}

async function buildUserFaceContext(userId: string) {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { faceEmbeddings: true },
  })
  if (!currentUser?.faceEnrolled || currentUser.faceEmbeddings.length === 0) {
    console.log('[magic-meet] rejected: face not enrolled')
    throw new ApiHttpError(400, ErrorCodes.FACE_NOT_ENROLLED)
  }

  const myGallery: number[][] = currentUser.faceEmbeddings
    .map((e) => e.vector as unknown)
    .filter(isValidEmbedding) as number[][]

  if (myGallery.length === 0) {
    throw new ApiHttpError(400, ErrorCodes.FACE_LEGACY_EMBEDDING)
  }

  return { currentUser, myGallery }
}

async function detectFacePool(photos: string[]): Promise<FaceCandidate[]> {
  let pool: FaceCandidate[]
  try {
    await ensureFaceService()
    pool = await collectFaceCandidates(photos)
  } catch (e) {
    console.error('[magic-meet] face detection failed', e)
    const { code, message } = faceErrorFromException(e)
    throw new ApiHttpError(500, code, message)
  }

  if (pool.length < 2) {
    console.log(
      `[magic-meet] rejected: only ${pool.length} face(s) across ${photos.length} frame(s)`
    )
    throw new ApiHttpError(
      400,
      ErrorCodes.MAGIC_MEET_MIN_FACES,
      `На фото должно быть минимум 2 лица (найдено: ${pool.length})`
    )
  }

  return pool
}

function validateSelfPresence(pool: FaceCandidate[], myGallery: number[][]) {
  const poolEmbeddings = pool.map((c) => c.embedding)
  const selfMatch = bestFaceMatchInGallery(poolEmbeddings, myGallery)
  if (selfMatch.sim < FACE_MATCH_THRESHOLD_SELF) {
    console.log(
      `[magic-meet] rejected: user not on photo (best self-sim=${selfMatch.sim.toFixed(3)})`
    )
    throw new ApiHttpError(400, ErrorCodes.MAGIC_MEET_USER_NOT_ON_PHOTO)
  }
  const myFaceCandidateIdx = selfMatch.faceIndex
  const myFrameIndex = pool[myFaceCandidateIdx]!.frameIndex
  console.log(
    `[magic-meet] self matched at frame=${myFrameIndex} sim=${selfMatch.sim.toFixed(3)} pool=${pool.length}`
  )
  return { selfMatch, myFaceCandidateIdx, myFrameIndex }
}

async function selectBestFrame(pool: FaceCandidate[], photos: string[], selfMatchIdx: number) {
  const bestFrameIdx = pickBestFrame(pool, selfMatchIdx) ?? 0
  const bestPhotoBase64 = photos[bestFrameIdx]!

  const photoHash = await computePhotoHash(bestPhotoBase64).catch(() => null)
  if (!photoHash) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_PHOTO)
  }

  return { bestPhotoBase64, photoHash }
}

// ── Public orchestrator ───────────────────────────────────────────────────────

export async function processMagicMeet(
  userId: string,
  input: MagicMeetInput
): Promise<MagicMeetResult> {
  const t0 = Date.now()
  const photos = normalizePhotos(input)

  console.log(
    `[magic-meet] request from user ${userId}, frames=${photos.length}, total=${photos.reduce((s, p) => s + p.length, 0)}B`
  )

  validateMagicMeetInput(photos)

  const { currentUser, myGallery } = await buildUserFaceContext(userId)

  const pool = await detectFacePool(photos)

  const { selfMatch, myFaceCandidateIdx } = validateSelfPresence(pool, myGallery)

  const { bestPhotoBase64, photoHash } = await selectBestFrame(pool, photos, myFaceCandidateIdx)

  const activeStreaks = await prisma.streak.findMany({
    where: { active: true, OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: { include: { faceEmbeddings: true } },
      userB: { include: { faceEmbeddings: true } },
    },
  })

  const { matched } = await matchPartners(userId, pool, myFaceCandidateIdx, activeStreaks)

  const { extended, added, skippedDuplicates } = await persistMatches(
    matched,
    bestPhotoBase64,
    photoHash,
    input.location,
    userId,
    pool,
    selfMatch.sim,
    currentUser
  )

  const partners = [...extended, ...added]

  if (partners.length === 0) {
    if (skippedDuplicates.length > 0) {
      console.log(`[magic-meet] rejected: duplicate photo for ${skippedDuplicates.join(', ')}`)
      throw new ApiHttpError(
        400,
        ErrorCodes.MAGIC_MEET_DUPLICATE_PHOTO,
        `Это фото уже было добавлено${skippedDuplicates.length === 1 ? ` (с @${skippedDuplicates[0]})` : ''}`
      )
    }
    console.log(
      `[magic-meet] rejected: no matching friends (${activeStreaks.length} active streaks checked)`
    )
    throw new ApiHttpError(400, ErrorCodes.MAGIC_MEET_NO_MATCH)
  }

  console.log(
    `[magic-meet] success: ${partners.map((p) => p.nickname).join(', ')} (+${Date.now() - t0}ms)`
  )

  return { extended, added, skippedDuplicates, partners }
}

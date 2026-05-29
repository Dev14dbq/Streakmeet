import { prisma } from '../lib/prisma.js'
import {
  saveBase64ImageAsAvif,
  computePhotoHash,
} from '../lib/saveImage.js'
import {
  bestFaceMatchInGallery,
  CURRENT_FACE_MODEL,
  ensureFaceService,
  FACE_MATCH_THRESHOLD_PARTNER,
  FACE_MATCH_THRESHOLD_SELF,
  isValidEmbedding,
} from '../lib/face.js'
import {
  collectFaceCandidates,
  normalizePhotos,
  pickBestFrame,
  type FaceCandidate,
} from './faceMatching.js'
import { instantMeetStreakDay } from '../lib/streakCalendar.js'
import { partnerOf } from '../lib/relations.js'
import { ErrorCodes, faceErrorFromException } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'
import { notifyMeetExtended, notifyMeetPhotoAdded } from '../lib/notifications.js'
import { recordMeetForStreak } from './streakMeetService.js'

export interface MagicMeetInput {
  photoBase64?: string
  photosBase64?: string[]
  location?: { lat: number; lng: number }
}

export interface MagicMeetPartner {
  nickname: string
  avatarUrl: string | null
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

async function selectBestFrame(
  pool: FaceCandidate[],
  photos: string[],
  selfMatchIdx: number
) {
  const bestFrameIdx = pickBestFrame(pool, selfMatchIdx) ?? 0
  const bestPhotoBase64 = photos[bestFrameIdx]!

  const photoHash = await computePhotoHash(bestPhotoBase64).catch(() => null)
  if (!photoHash) {
    throw new ApiHttpError(400, ErrorCodes.INVALID_PHOTO)
  }

  return { bestPhotoBase64, photoHash }
}

type ActiveStreak = Awaited<ReturnType<typeof prisma.streak.findMany<{
  include: {
    userA: { include: { faceEmbeddings: true } }
    userB: { include: { faceEmbeddings: true } }
  }
}>>>[number]

type StreakPartnerUser = ActiveStreak['userA']

type MatchedEntry = {
  streak: ActiveStreak
  partner: StreakPartnerUser
  matchSim: number
}

async function matchPartners(
  userId: string,
  pool: FaceCandidate[],
  myFaceCandidateIdx: number,
  activeStreaks: ActiveStreak[]
): Promise<{ matched: MatchedEntry[] }> {
  const partnerProbes = pool
    .map((c) => c.embedding)
    .filter((_, i) => i !== myFaceCandidateIdx)

  const matched: MatchedEntry[] = []

  for (const streak of activeStreaks) {
    const partner = partnerOf(streak, userId)
    if (!partner.faceEnrolled) continue

    const partnerGallery: number[][] = partner.faceEmbeddings
      .map((e) => e.vector as unknown)
      .filter(isValidEmbedding) as number[][]
    if (partnerGallery.length === 0) continue

    const m = bestFaceMatchInGallery(partnerProbes, partnerGallery)
    if (m.sim < FACE_MATCH_THRESHOLD_PARTNER) {
      console.log(
        `[magic-meet] partner @${partner.nickname} not matched (best=${m.sim.toFixed(3)})`
      )
      continue
    }
    console.log(`[magic-meet] partner @${partner.nickname} matched (sim=${m.sim.toFixed(3)})`)

    matched.push({ streak, partner: partner as StreakPartnerUser, matchSim: m.sim })
  }

  return { matched }
}

type UserFaceContext = Awaited<ReturnType<typeof buildUserFaceContext>>

async function persistMatches(
  matched: MatchedEntry[],
  bestPhotoBase64: string,
  photoHash: string,
  location: MagicMeetInput['location'],
  userId: string,
  pool: FaceCandidate[],
  selfSim: number,
  currentUser: UserFaceContext['currentUser']
): Promise<{ extended: MagicMeetPartner[]; added: MagicMeetPartner[]; skippedDuplicates: string[] }> {
  const extended: MagicMeetPartner[] = []
  const added: MagicMeetPartner[] = []
  const skippedDuplicates: string[] = []
  let savedPhotoUrl: string | null = null

  for (const { streak, partner, matchSim } of matched) {
    const today = instantMeetStreakDay(streak.timezone)

    if (!savedPhotoUrl) {
      savedPhotoUrl = await saveBase64ImageAsAvif(bestPhotoBase64, `${Date.now()}_${userId}`)
    }

    const meetResult = await recordMeetForStreak({
      streakId: streak.id,
      calendarDate: today,
      uploadedById: userId,
      photoUrl: savedPhotoUrl,
      photoHash,
      latitude: location?.lat,
      longitude: location?.lng,
      facesDetected: pool.length,
      matchScores: {
        self: selfSim,
        partner: matchSim,
        model: CURRENT_FACE_MODEL,
      },
    })

    if (meetResult.duplicate) {
      skippedDuplicates.push(partner.nickname)
      continue
    }

    const partnerInfo: MagicMeetPartner = {
      nickname: partner.nickname,
      avatarUrl: partner.avatarUrl,
    }

    if (meetResult.extended) {
      notifyMeetExtended(partner.id, currentUser.nickname)
      extended.push(partnerInfo)
    } else {
      notifyMeetPhotoAdded(partner.id, currentUser.nickname)
      added.push(partnerInfo)
    }
  }

  return { extended, added, skippedDuplicates }
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

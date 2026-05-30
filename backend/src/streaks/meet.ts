import { prisma } from '../db/client.js'
import { ErrorCodes, ApiHttpError } from '../common/errors.js'
import {
  bestFaceMatchInGallery,
  CURRENT_FACE_MODEL,
  FACE_MATCH_THRESHOLD_PARTNER,
  isValidEmbedding,
} from '../face/service.js'
import { type FaceCandidate } from '../face/matching.js'
import { partnerOf } from '../common/helpers.js'
import { notifyMeetExtended, notifyMeetPhotoAdded } from '../notifications/push.js'
import { saveBase64ImageAsAvif } from '../storage/images.js'
import { instantMeetStreakDay } from './calendar.js'

export interface MagicMeetPartner {
  nickname: string
  avatarUrl: string | null
}

type ActiveStreak = Awaited<
  ReturnType<
    typeof prisma.streak.findMany<{
      include: {
        userA: { include: { faceEmbeddings: true } }
        userB: { include: { faceEmbeddings: true } }
      }
    }>
  >
>[number]
type StreakPartnerUser = ActiveStreak['userA']
type MatchedEntry = { streak: ActiveStreak; partner: StreakPartnerUser; matchSim: number }

export async function matchPartners(
  userId: string,
  pool: FaceCandidate[],
  myFaceCandidateIdx: number,
  activeStreaks: ActiveStreak[]
): Promise<{ matched: MatchedEntry[] }> {
  const partnerProbes = pool.map((c) => c.embedding).filter((_, i) => i !== myFaceCandidateIdx)
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

type UserFaceContext = { currentUser: { id: string; nickname: string; faceEnrolled: boolean } }

export async function persistMatches(
  matched: MatchedEntry[],
  bestPhotoBase64: string,
  photoHash: string,
  location: { lat: number; lng: number } | undefined,
  userId: string,
  pool: FaceCandidate[],
  selfSim: number,
  currentUser: UserFaceContext['currentUser']
): Promise<{
  extended: MagicMeetPartner[]
  added: MagicMeetPartner[]
  skippedDuplicates: string[]
}> {
  const extended: MagicMeetPartner[] = []
  const added: MagicMeetPartner[] = []
  const skippedDuplicates: string[] = []
  let savedPhotoUrl: string | null = null
  for (const { streak, partner, matchSim } of matched) {
    const today = instantMeetStreakDay(streak.timezone)
    if (!savedPhotoUrl)
      savedPhotoUrl = await saveBase64ImageAsAvif(bestPhotoBase64, `${Date.now()}_${userId}`)
    const meetResult = await recordMeetForStreak({
      streakId: streak.id,
      calendarDate: today,
      uploadedById: userId,
      photoUrl: savedPhotoUrl,
      photoHash,
      latitude: location?.lat,
      longitude: location?.lng,
      facesDetected: pool.length,
      matchScores: { self: selfSim, partner: matchSim, model: CURRENT_FACE_MODEL },
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

export interface RecordMeetInput {
  streakId: string
  calendarDate: string
  uploadedById: string
  photoUrl: string
  photoHash: string
  latitude?: number
  longitude?: number
  matchScores?: unknown
  facesDetected?: number
}
export interface RecordMeetResult {
  extended: boolean
  duplicate: boolean
  streakDayId: string
}

export async function recordMeetForStreak(input: RecordMeetInput): Promise<RecordMeetResult> {
  const {
    streakId,
    calendarDate,
    uploadedById,
    photoUrl,
    photoHash,
    latitude,
    longitude,
    matchScores,
    facesDetected,
  } = input
  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    select: { id: true, lastMetDate: true, userAId: true, userBId: true },
  })
  if (!streak) throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  let streakDay = await prisma.streakDay.findUnique({
    where: { streakId_date: { streakId, date: calendarDate } },
  })
  if (streakDay) {
    const existing = await prisma.meetProof.findFirst({
      where: { streakDayId: streakDay.id, photoHash },
    })
    if (existing) return { extended: false, duplicate: true, streakDayId: streakDay.id }
  }
  const extended = streak.lastMetDate !== calendarDate
  const streakDayId = await prisma.$transaction(async (tx) => {
    if (!streakDay)
      streakDay = await tx.streakDay.create({
        data: { streakId, date: calendarDate, status: 'MET' },
      })
    if (extended) {
      await tx.streak.update({
        where: { id: streakId },
        data: { count: { increment: 1 }, lastMetDate: calendarDate },
      })
      await tx.user.updateMany({
        where: { id: { in: [streak.userAId, streak.userBId] } },
        data: { gemsBalance: { increment: 1 } },
      })
    }
    await tx.meetProof.create({
      data: {
        streakDayId: streakDay.id,
        uploadedById,
        photoUrl,
        photoHash,
        latitude,
        longitude,
        facesDetected: facesDetected ?? 0,
        matchScores: matchScores ?? undefined,
      },
    })
    return streakDay.id
  })
  return { extended, duplicate: false, streakDayId }
}

import { prisma } from '../lib/prisma.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'

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
  if (!streak) {
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }

  let streakDay = await prisma.streakDay.findUnique({
    where: { streakId_date: { streakId, date: calendarDate } },
  })

  if (streakDay) {
    const existing = await prisma.meetProof.findFirst({
      where: { streakDayId: streakDay.id, photoHash },
    })
    if (existing) {
      return { extended: false, duplicate: true, streakDayId: streakDay.id }
    }
  }

  const extended = streak.lastMetDate !== calendarDate

  const streakDayId = await prisma.$transaction(async (tx) => {
    if (!streakDay) {
      streakDay = await tx.streakDay.create({
        data: { streakId, date: calendarDate, status: 'MET' },
      })
    }

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

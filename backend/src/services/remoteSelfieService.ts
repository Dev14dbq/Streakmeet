import { prisma } from '../lib/prisma.js'
import {
  saveBase64ImageAsAvif,
  combineRemoteSelfieImages,
  hashImageFile,
} from '../lib/saveImage.js'
import { remoteSelfieStreakDay } from '../lib/streakCalendar.js'
import { expireStaleRemoteSelfieRequests, REMOTE_SELFIE_TTL_MS } from '../lib/remoteSelfie.js'
import { partnerIdOf, partnerOf } from '../lib/relations.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'
import { findStreakForUser } from '../lib/streakAccess.js'
import {
  notifyRemoteSelfieCompleted,
  notifyRemoteSelfieRequest,
} from '../lib/notifications.js'
import { recordMeetForStreak } from './streakMeetService.js'

export async function initRemoteSelfie(
  userId: string,
  streakId: string,
  photoBase64: string
) {
  const streak = await findStreakForUser(streakId, userId)

  const partnerId = partnerIdOf(streak, userId)
  const sender = partnerOf(streak, userId)

  await expireStaleRemoteSelfieRequests(streak.id)

  const existingPending = await prisma.remoteSelfieRequest.findFirst({
    where: { streakId: streak.id, status: 'PENDING' },
  })
  if (existingPending) {
    throw new ApiHttpError(409, ErrorCodes.REMOTE_SELFIE_PENDING)
  }

  const savedPhotoUrl = await saveBase64ImageAsAvif(
    photoBase64,
    `remote_selfie_${Date.now()}_${userId}`
  )

  const request = await prisma.remoteSelfieRequest.create({
    data: {
      streakId: streak.id,
      senderId: userId,
      receiverId: partnerId,
      senderPhotoUrl: savedPhotoUrl,
    },
  })

  notifyRemoteSelfieRequest(partnerId, sender.nickname)
  return request
}

export async function replyRemoteSelfie(
  userId: string,
  streakId: string,
  requestId: string,
  photoBase64: string
) {
  const request = await prisma.remoteSelfieRequest.findUnique({
    where: { id: requestId },
    include: { sender: true },
  })

  if (!request || request.receiverId !== userId || request.streakId !== streakId) {
    throw new ApiHttpError(404, ErrorCodes.REMOTE_SELFIE_NOT_FOUND)
  }

  if (request.status !== 'PENDING') {
    throw new ApiHttpError(400, ErrorCodes.REMOTE_SELFIE_HANDLED)
  }

  const ageMs = Date.now() - request.createdAt.getTime()
  if (ageMs > REMOTE_SELFIE_TTL_MS) {
    await prisma.remoteSelfieRequest.update({
      where: { id: requestId },
      data: { status: 'EXPIRED' },
    })
    throw new ApiHttpError(410, ErrorCodes.REMOTE_SELFIE_EXPIRED)
  }

  const claimed = await prisma.remoteSelfieRequest.updateMany({
    where: {
      id: requestId,
      streakId,
      receiverId: userId,
      status: 'PENDING',
    },
    data: { status: 'COMPLETED' },
  })
  if (claimed.count === 0) {
    throw new ApiHttpError(409, ErrorCodes.REMOTE_SELFIE_HANDLED)
  }

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include: { userA: true, userB: true },
  })

  if (!streak) {
    await prisma.remoteSelfieRequest.update({
      where: { id: requestId },
      data: { status: 'PENDING' },
    })
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }

  async function revertClaim() {
    await prisma.remoteSelfieRequest.update({
      where: { id: requestId },
      data: { status: 'PENDING' },
    })
  }

  let combinedUrl: string
  try {
    combinedUrl = await combineRemoteSelfieImages(
      request.senderPhotoUrl,
      photoBase64,
      `combined_${Date.now()}_${streakId}`
    )
  } catch (e) {
    console.error('Error combining images', e)
    await revertClaim()
    throw new ApiHttpError(500, ErrorCodes.IMAGE_COMBINE_FAILED)
  }

  let photoHash: string
  try {
    photoHash = await hashImageFile(combinedUrl)
  } catch (e) {
    console.error('Error hashing combined image', e)
    await revertClaim()
    throw new ApiHttpError(500, ErrorCodes.IMAGE_SAVE_FAILED)
  }

  const today = remoteSelfieStreakDay(streak.timezone, request.createdAt)

  const meetResult = await recordMeetForStreak({
    streakId: streak.id,
    calendarDate: today,
    uploadedById: userId,
    photoUrl: combinedUrl,
    photoHash,
    facesDetected: 2,
  })

  const receiver = partnerOf(streak, userId)
  notifyRemoteSelfieCompleted(request.senderId, receiver.nickname, meetResult.extended)

  return { success: true as const, photoUrl: combinedUrl }
}

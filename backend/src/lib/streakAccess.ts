import { prisma } from './prisma.js'
import { ErrorCodes } from './apiErrors.js'
import { ApiHttpError } from './httpErrors.js'

/** Loads an active streak and throws 404 if the user is not a participant. */
export async function findStreakForUser(streakId: string, userId: string) {
  const streak = await prisma.streak.findFirst({
    where: { id: streakId, active: true },
    include: { userA: true, userB: true },
  })
  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    throw new ApiHttpError(404, ErrorCodes.STREAK_NOT_FOUND)
  }
  return streak
}

export function pairWhere(userAId: string, userBId: string) {
  return {
    OR: [
      { userAId, userBId },
      { userAId: userBId, userBId: userAId },
    ],
  }
}

export function streakForUserWhere(userId: string) {
  return {
    OR: [{ userAId: userId }, { userBId: userId }],
  }
}

type StreakParticipants = {
  userAId: string
  userBId: string
}

type StreakWithUsers<TUser = unknown> = StreakParticipants & {
  userA?: TUser
  userB?: TUser
}

export function partnerIdOf(streak: StreakParticipants, userId: string): string {
  return streak.userAId === userId ? streak.userBId : streak.userAId
}

export function partnerOf<TUser>(streak: StreakWithUsers<TUser>, userId: string): TUser {
  return (streak.userAId === userId ? streak.userB : streak.userA) as TUser
}

import type { AuthUser } from '../types/api.js'

export const userProfileSelect = {
  id: true,
  email: true,
  nickname: true,
  qrCodeId: true,
  gemsBalance: true,
  faceEnrolled: true,
  emailVerifiedAt: true,
  avatarUrl: true,
  timezone: true,
  isPublic: true,
  notifyFriends: true,
  notifyMeet: true,
  geoOnPhotos: true,
} as const

export type UserProfileRow = {
  id: string
  email: string
  nickname: string
  qrCodeId: string
  gemsBalance: number
  faceEnrolled: boolean
  emailVerifiedAt: Date | null
  avatarUrl: string | null
  timezone: string
  isPublic: boolean
  notifyFriends: boolean
  notifyMeet: boolean
  geoOnPhotos: boolean
}

export function isEmailVerified(user: {
  emailVerifiedAt: Date | null
  passwordHash: string
}): boolean {
  if (!user.passwordHash) return true
  return user.emailVerifiedAt != null
}

export function authUserPayload(user: UserProfileRow & { passwordHash?: string }): AuthUser {
  const emailVerified =
    user.passwordHash !== undefined
      ? isEmailVerified({ emailVerifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash })
      : user.emailVerifiedAt != null

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    qrCodeId: user.qrCodeId,
    gemsBalance: user.gemsBalance,
    faceEnrolled: user.faceEnrolled,
    emailVerified,
    avatarUrl: user.avatarUrl ?? undefined,
    timezone: user.timezone,
    isPublic: user.isPublic,
    notifyFriends: user.notifyFriends,
    notifyMeet: user.notifyMeet,
    geoOnPhotos: user.geoOnPhotos,
  }
}

export function userProfilePayload(user: UserProfileRow): AuthUser {
  return authUserPayload(user)
}

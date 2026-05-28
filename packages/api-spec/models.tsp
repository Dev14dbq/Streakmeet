namespace StreakMeet;

/** Standard error response */
model ApiError {
  error: string;
  code: string;
}

model OkResponse {
  ok: true;
}

model SuccessResponse {
  success: true;
}

/** User info returned in auth flows and stored client-side */
model AuthUser {
  id: string;
  email: string;
  nickname: string;
  qrCodeId?: string;
  gemsBalance?: int32;
  faceEnrolled: boolean;
  emailVerified: boolean;
  avatarUrl?: string;
  timezone?: string;
  isPublic?: boolean;
  notifyFriends?: boolean;
  notifyMeet?: boolean;
  geoOnPhotos?: boolean;
}

/** Full user profile */
model UserProfile {
  id: string;
  email: string;
  nickname: string;
  qrCodeId?: string;
  gemsBalance?: int32;
  faceEnrolled: boolean;
  emailVerified: boolean;
  avatarUrl?: string | null;
  timezone?: string;
  isPublic?: boolean;
  notifyFriends?: boolean;
  notifyMeet?: boolean;
  geoOnPhotos?: boolean;
}

model UserPreferences {
  notifyFriends: boolean;
  notifyMeet: boolean;
  geoOnPhotos: boolean;
}

model UserSummary {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  qrCodeId?: string;
}

model AuthResponse {
  accessToken: string;
  user: AuthUser;
}

model DeletedAccountInfo {
  code: "ACCOUNT_DELETED";
  email: string;
  deletedAt: utcDateTime;
  daysRemaining: int32;
}

enum LegalSlug {
  terms: "terms",
  privacy: "privacy",
}

enum FriendshipStatus {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  BLOCKED: "BLOCKED",
}

enum StreakDayStatus {
  MET: "MET",
  MISSED: "MISSED",
}

model MeetProofUploader {
  id: string;
  nickname: string;
}

model MeetProofStreakUser {
  id: string;
  nickname: string;
}

model MeetProofStreak {
  userA: MeetProofStreakUser;
  userB: MeetProofStreakUser;
}

model MeetProofStreakDay {
  streak: MeetProofStreak;
}

model MeetProof {
  id: string;
  photoUrl: string;
  photoHash?: string;
  latitude?: float64 | null;
  longitude?: float64 | null;
  facesDetected?: int32;
  createdAt?: utcDateTime;
  uploadedBy: MeetProofUploader;
  streakDay: MeetProofStreakDay;
}

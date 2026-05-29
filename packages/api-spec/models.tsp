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

/** Minimal user reference: id + nickname */
model UserRef {
  id: string;
  nickname: string;
}

/** Shared base for AuthUser and UserProfile (all fields except avatarUrl) */
model UserBase {
  id: string;
  email: string;
  nickname: string;
  qrCodeId?: string;
  gemsBalance?: int32;
  faceEnrolled: boolean;
  emailVerified: boolean;
  timezone?: string;
  isPublic?: boolean;
  notifyFriends?: boolean;
  notifyMeet?: boolean;
  geoOnPhotos?: boolean;
}

/** User info returned in auth flows and stored client-side */
model AuthUser extends UserBase {
  avatarUrl?: string;
}

/** Full user profile — avatarUrl may be explicitly null when cleared */
model UserProfile extends UserBase {
  avatarUrl?: string | null;
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

model MeetProofUploader extends UserRef {}
model MeetProofStreakUser extends UserRef {}

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

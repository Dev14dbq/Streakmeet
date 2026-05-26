import type { components } from '../generated/schema.js'

type Schemas = components['schemas']

// ─── Shared models ───────────────────────────────────────────────────────────

export type AuthUser = Schemas['AuthUser']
export type UserProfile = Schemas['UserProfile']
export type UserSummary = Schemas['UserSummary']
export type AuthResponse = Schemas['AuthResponse']

/** Standard error response (not emitted to OpenAPI as standalone schema) */
export interface ApiError {
  error: string
  code: string
}

export type SuccessResponse = Schemas['SuccessResponse']

/** Not in OpenAPI (403 error body) — kept for client-side error parsing */
export interface DeletedAccountInfo {
  code: 'ACCOUNT_DELETED'
  email: string
  deletedAt: string
  daysRemaining: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type CheckEmailRequest = Schemas['Auth.CheckEmailRequest']
export type RegisterPayload = Schemas['Auth.RegisterRequest']
export type RestoreAccountPayload =
  | Schemas['Auth.RestoreAccountEmailRequest']
  | Schemas['Auth.RestoreAccountGoogleRequest']
  | Schemas['Auth.RestoreAccountAppleRequest']

// ─── Users ───────────────────────────────────────────────────────────────────

export type MeetProof = Schemas['MeetProof']

// ─── Friends ─────────────────────────────────────────────────────────────────

export type FriendListItem = Schemas['Friends.FriendListItem']
export type FriendshipStatus = Schemas['FriendshipStatus']

// ─── Streaks ─────────────────────────────────────────────────────────────────

export type StreakListItem = Schemas['Streaks.StreakListItem']
export type StreakDetail = Schemas['Streaks.StreakDetail']
export type MagicMeetPartner = Schemas['Streaks.MagicMeetPartner']
export type MagicMeetResponse = Schemas['Streaks.MagicMeetResponse']
export type RemoteSelfieRequest = Schemas['Streaks.RemoteSelfieRequest']

// ─── Location ────────────────────────────────────────────────────────────────

export type MyLocationState = Schemas['Location.MyLocationState']
export type FriendLocation = Schemas['Location.FriendLocation']

// ─── Legal ───────────────────────────────────────────────────────────────────

export type LegalDocument = Schemas['Legal.LegalDocument']
export type LegalConsentStatus = Schemas['Legal.LegalConsentStatus']
export type LegalSlug = Schemas['LegalSlug']

// ─── Public ──────────────────────────────────────────────────────────────────

export type PublicUser = Schemas['Public.PublicUser']
export type PublicFriendshipSelf = Schemas['Public.PublicFriendshipSelf']
export type PublicFriendshipRelation = Schemas['Public.PublicFriendshipRelation']
export type PublicFriendship = PublicFriendshipSelf | PublicFriendshipRelation | null
export type PublicProfile = Schemas['Public.PublicProfile']

// Re-export raw schema for advanced use
export type { components, paths, operations } from '../generated/schema.js'

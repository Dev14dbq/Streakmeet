export type {
  AuthResponse,
  AuthUser,
  DeletedAccountInfo,
  FriendLocation,
  LegalConsentStatus,
  LegalDocument,
  MagicMeetPartner,
  MagicMeetResponse,
  MyLocationState,
  PublicFriendship,
  PublicProfile,
  PublicUser,
  RegisterPayload,
  RestoreAccountPayload,
} from '@streakmeet/api-spec'

export {
  api,
  fetcher,
  getApiErrorMessage,
  isNetworkError,
  setUnauthorizedHandler,
} from './api/client'

export {
  findUserByScanTarget,
  getRealtimeServerUrl,
  isPublicNicknamePath,
  parseQrScanTarget,
  profileUrl,
  publicAppOrigin,
  RESERVED_PATHS,
} from './routing'

export {
  checkEmail,
  confirmEmailVerification,
  enrollFace,
  forgotPassword,
  getDeletedAccountInfo,
  login,
  register,
  resendVerificationEmail,
  resetPassword,
  restoreAccount,
} from './api/auth'

export { acceptFriend, getFriends, requestFriend } from './api/friends'

export { acceptLegalDocuments, getLegalConsentStatus, getLegalDocument } from './api/legal'

export {
  getFriendLocations,
  getMyLocation,
  setLocationSharing,
  updateMyLocation,
} from './api/location'

export {
  createStreak,
  getStreak,
  getStreaks,
  initRemoteSelfie,
  magicMeet,
  remindStreak,
  replyRemoteSelfie,
} from './api/streaks'

export {
  changePassword,
  deleteAccount,
  getMyPhotos,
  searchUsers,
  syncDeviceTimezone,
  updateEmail,
  updatePreferences,
  updatePublicProfile,
  updateSettings,
  uploadAvatar,
} from './api/users'

export type {
  MemoriesFeedResponse,
  MemoryFeedItem,
  MemoryMeetItem,
  MemoryMilestoneItem,
} from './api/memories'

export { getMemories } from './api/memories'

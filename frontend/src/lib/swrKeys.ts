export const SWR_KEYS = {
  me: '/api/users/me',
  streaks: '/api/streaks',
  friends: '/api/friends',
  legalStatus: '/api/legal/status/me',
  locationMe: '/api/location/me',
  friendLocations: '/api/location/friends',
  photosPage: (page: number, limit = 12) => `/api/users/photos?page=${page}&limit=${limit}`,
} as const

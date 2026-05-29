export const SWR_KEYS = {
  me: '/api/users/me',
  streaks: '/api/streaks',
  friends: '/api/friends',
  legalStatus: '/api/legal/status/me',
  locationMe: '/api/location/me',
  friendLocations: '/api/location/friends',
  photosPage: (page: number, limit = 12) => `/api/users/photos?page=${page}&limit=${limit}`,
  memoriesPage: (page: number, limit = 20, streakId?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (streakId) params.set('streakId', streakId)
    return `/api/memories?${params.toString()}`
  },
} as const

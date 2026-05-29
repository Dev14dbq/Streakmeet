import { mutate } from 'swr'
import { isAxiosError } from 'axios'
import {
  api,
  getDeletedAccountInfo,
  isNetworkError,
  syncDeviceTimezone,
  type AuthUser,
  type LegalConsentStatus,
} from './api'
import { initGoogleAuth } from './googleAuth'
import { pruneStaleImageCache } from './remoteImageCache'
import { SWR_KEYS } from './swrKeys'

export interface DeletedAccountRedirect {
  email: string
  daysRemaining: number
}

export interface BootstrapSessionResult {
  user: AuthUser | null
  legalStatus: LegalConsentStatus | null
  legalChecked: boolean
  legalFetchFailed: boolean
  deletedAccount: DeletedAccountRedirect | null
  /** Session restored from local cache because the server could not be reached. */
  usedCachedSession?: boolean
}

function readCachedUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem('user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  } catch {
    return null
  }
}

export async function bootstrapSession(): Promise<BootstrapSessionResult> {
  const token = localStorage.getItem('accessToken')
  if (!token) {
    return {
      user: null,
      legalStatus: null,
      legalChecked: true,
      legalFetchFailed: false,
      deletedAccount: null,
    }
  }

  try {
    const { data: user } = await api.get<AuthUser>(SWR_KEYS.me)
    localStorage.setItem('user', JSON.stringify(user))
    void mutate(SWR_KEYS.me, user, { revalidate: false })

    const [streaks, friends, legal, location, friendLocations, photos] = await Promise.allSettled([
      api.get(SWR_KEYS.streaks),
      api.get(SWR_KEYS.friends),
      api.get(SWR_KEYS.legalStatus),
      api.get(SWR_KEYS.locationMe),
      api.get(SWR_KEYS.friendLocations),
      api.get(SWR_KEYS.photosPage(1)),
    ])

    if (streaks.status === 'fulfilled') {
      void mutate(SWR_KEYS.streaks, streaks.value.data, { revalidate: false })
    }
    if (friends.status === 'fulfilled') {
      void mutate(SWR_KEYS.friends, friends.value.data, { revalidate: false })
    }
    if (location.status === 'fulfilled') {
      void mutate(SWR_KEYS.locationMe, location.value.data, { revalidate: false })
    }
    if (friendLocations.status === 'fulfilled') {
      void mutate(SWR_KEYS.friendLocations, friendLocations.value.data, { revalidate: false })
    }
    if (photos.status === 'fulfilled') {
      void mutate(SWR_KEYS.photosPage(1), photos.value.data, { revalidate: false })
    }

    let legalStatus: LegalConsentStatus | null = null
    let legalFetchFailed = false
    if (legal.status === 'fulfilled') {
      legalStatus = legal.value.data
    } else {
      legalFetchFailed = true
    }

    void syncDeviceTimezone().catch(() => {})
    void pruneStaleImageCache()
    void initGoogleAuth()

    return {
      user,
      legalStatus,
      legalChecked: true,
      legalFetchFailed,
      deletedAccount: null,
    }
  } catch (err) {
    const deleted = getDeletedAccountInfo(err)
    if (deleted) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
      return {
        user: null,
        legalStatus: null,
        legalChecked: true,
        legalFetchFailed: false,
        deletedAccount: {
          email: deleted.email,
          daysRemaining: deleted.daysRemaining,
        },
      }
    }

    const status = isAxiosError(err) ? err.response?.status : undefined
    if (status === 401) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
      return {
        user: null,
        legalStatus: null,
        legalChecked: true,
        legalFetchFailed: false,
        deletedAccount: null,
      }
    }

    const cachedUser = readCachedUser()
    if (cachedUser && (isNetworkError(err) || (status != null && status >= 500))) {
      return {
        user: cachedUser,
        legalStatus: null,
        legalChecked: false,
        legalFetchFailed: true,
        deletedAccount: null,
        usedCachedSession: true,
      }
    }

    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    return {
      user: null,
      legalStatus: null,
      legalChecked: true,
      legalFetchFailed: false,
      deletedAccount: null,
    }
  }
}

import { mutate } from 'swr'
import {
  api,
  getDeletedAccountInfo,
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

    const [streaks, friends, legal, location, photos] = await Promise.allSettled([
      api.get(SWR_KEYS.streaks),
      api.get(SWR_KEYS.friends),
      api.get(SWR_KEYS.legalStatus),
      api.get(SWR_KEYS.locationMe),
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

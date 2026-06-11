import i18n from '../i18n'
import { getDeletedAccountInfo, getApiErrorMessage, migratedApi, type AuthUser } from './api'
import { getDeviceTimezone } from './timezone'

export type AppleSignInResult =
  | { ok: true; user: AuthUser; accessToken: string }
  | { ok: false; deleted: { email: string; daysRemaining: number }; sessionToken: string }
  | { ok: false; deleted: null; errorMessage: string }

export async function completeAppleSignIn(sessionToken: string): Promise<AppleSignInResult> {
  if (!sessionToken.trim()) {
    return { ok: false, deleted: null, errorMessage: i18n.t('auth.appleNotConfigured') }
  }

  try {
    const { data } = await migratedApi().post<{ accessToken: string; user: AuthUser }>(
      '/api/auth/apple',
      {
        sessionToken,
        timezone: getDeviceTimezone(),
      }
    )
    return { ok: true, user: data.user, accessToken: data.accessToken }
  } catch (err) {
    const deleted = getDeletedAccountInfo(err)
    if (deleted) {
      return { ok: false, deleted, sessionToken }
    }
    return {
      ok: false,
      deleted: null,
      errorMessage: getApiErrorMessage(err, i18n.t('auth.googleError')),
    }
  }
}

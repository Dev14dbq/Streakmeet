import i18n from '../i18n'
import { api, getDeletedAccountInfo, getApiErrorMessage, type AuthUser } from './api'
import { getDeviceTimezone } from './timezone'
import type { GoogleSignInTokens } from './googleAuth'

export type GoogleSignInResult =
  | { ok: true; user: AuthUser; accessToken: string }
  | { ok: false; deleted: { email: string; daysRemaining: number }; tokens: GoogleSignInTokens }
  | { ok: false; deleted: null; errorMessage: string }

export async function completeGoogleSignIn(
  tokens: GoogleSignInTokens
): Promise<GoogleSignInResult> {
  if (!tokens.accessToken && !tokens.idToken) {
    return { ok: false, deleted: null, errorMessage: i18n.t('auth.googleTokenMissing') }
  }

  try {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/api/auth/google', {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      timezone: getDeviceTimezone(),
    })
    return { ok: true, user: data.user, accessToken: data.accessToken }
  } catch (err) {
    const deleted = getDeletedAccountInfo(err)
    if (deleted) {
      return { ok: false, deleted, tokens }
    }
    return {
      ok: false,
      deleted: null,
      errorMessage: getApiErrorMessage(err, i18n.t('auth.googleError')),
    }
  }
}

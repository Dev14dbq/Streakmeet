import bcrypt from 'bcryptjs'
import { findUserByEmail, isRetentionExpired, purgeUser } from '../../lib/accountDeletion.js'
import { ErrorCodes } from '../../lib/apiErrors.js'
import type { AuthResponse } from '../../types/api.js'
import { resolveGoogleProfile } from '../oauth/google.js'
import { verifyAppleIdToken } from '../oauth/apple.js'
import { AuthServiceError, DeletedAccountPendingError } from './errors.js'
import { buildAuthResponse } from './tokens.js'
import {
  assertNotDeletedAccount,
  findOrCreateOAuthUser,
  loadFullUser,
  restoreDeletedUser,
  type UserProfileRow,
} from './shared.js'

export async function restoreAccount(input: {
  email?: string
  password?: string
  provider?: 'google' | 'apple'
  accessToken?: string
  idToken?: string
}): Promise<AuthResponse> {
  const { email, password, provider, accessToken, idToken } = input

  try {
    let userEmail: string | undefined

    if (provider === 'google') {
      if (!accessToken && !idToken) {
        throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
      }
      const profile = await resolveGoogleProfile({ accessToken, idToken })
      userEmail = profile.email
    } else if (provider === 'apple') {
      if (!idToken) {
        throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
      }
      const payload = await verifyAppleIdToken(idToken)
      userEmail = payload.email
    } else {
      if (!email || !password) {
        throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
      }
      const user = await findUserByEmail(email)
      if (!user || !user.passwordHash) {
        throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
      }
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
      }
      if (!user.deletedAt) {
        return buildAuthResponse(user as UserProfileRow & { passwordHash: string })
      }
      if (isRetentionExpired(user.deletedAt)) {
        await purgeUser(user.id)
        throw new AuthServiceError(410, ErrorCodes.ACCOUNT_RETENTION_EXPIRED)
      }
      const restored = await restoreDeletedUser(user.id)
      return buildAuthResponse(restored)
    }

    const oauthRestore = provider === 'google' || provider === 'apple'

    if (!userEmail) {
      throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
    }

    const user = await findUserByEmail(userEmail)
    if (!user) {
      throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
    }
    if (!user.deletedAt) {
      const full = await loadFullUser(user.id)
      if (!full) {
        throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
      }
      return buildAuthResponse(full)
    }
    if (isRetentionExpired(user.deletedAt)) {
      await purgeUser(user.id)
      throw new AuthServiceError(410, ErrorCodes.ACCOUNT_RETENTION_EXPIRED)
    }

    const restored = await restoreDeletedUser(user.id, { oauthVerified: oauthRestore })
    return buildAuthResponse(restored)
  } catch (e) {
    if (e instanceof AuthServiceError) throw e
    throw new AuthServiceError(401, ErrorCodes.RESTORE_ACCOUNT_FAILED)
  }
}

async function runOAuthLogin({
  resolveProfile,
  configEnvVar,
  timezone,
}: {
  resolveProfile: () => Promise<{
    email: string
    displayName?: string
    provider: 'google' | 'apple'
  }>
  configEnvVar: string | undefined
  timezone?: string
}): Promise<AuthResponse> {
  if (!configEnvVar) {
    throw new AuthServiceError(503, ErrorCodes.OAUTH_NOT_CONFIGURED)
  }
  try {
    const { email, displayName, provider } = await resolveProfile()
    const user = await findOrCreateOAuthUser({ email, provider, displayName, timezone })
    await assertNotDeletedAccount(user)
    const full = await loadFullUser(user.id)
    if (!full) throw new AuthServiceError(401, ErrorCodes.INVALID_CREDENTIALS)
    return buildAuthResponse(full)
  } catch (e) {
    if (e instanceof AuthServiceError || e instanceof DeletedAccountPendingError) throw e
    throw new AuthServiceError(401, ErrorCodes.OAUTH_INVALID_TOKEN)
  }
}

export async function googleLogin(input: {
  accessToken?: string
  idToken?: string
  timezone?: string
}): Promise<AuthResponse> {
  if (!input.accessToken && !input.idToken) {
    throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
  }
  return runOAuthLogin({
    configEnvVar: process.env.GOOGLE_CLIENT_ID,
    timezone: input.timezone,
    resolveProfile: async () => {
      const info = await resolveGoogleProfile({
        accessToken: input.accessToken,
        idToken: input.idToken,
      })
      return { email: info.email, displayName: info.name, provider: 'google' }
    },
  })
}

export async function appleLogin(input: {
  idToken?: string
  timezone?: string
}): Promise<AuthResponse> {
  if (!input.idToken) {
    throw new AuthServiceError(400, ErrorCodes.MISSING_FIELD)
  }
  return runOAuthLogin({
    configEnvVar: process.env.APPLE_CLIENT_ID,
    timezone: input.timezone,
    resolveProfile: async () => {
      const payload = await verifyAppleIdToken(input.idToken!)
      if (!payload.email) throw new Error('No email in token')
      return { email: payload.email, provider: 'apple' }
    },
  })
}

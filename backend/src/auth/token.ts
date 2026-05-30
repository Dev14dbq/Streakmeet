import jwt from 'jsonwebtoken'
import { prisma } from '../db/client.js'
import { getJwtSecret } from '../config/env.js'
import { isEmailVerified, authUserPayload } from '../users/payload.js'
import type { AuthResponse } from '../types/api.js'
import type { UserProfileRow } from '../users/payload.js'

export interface AuthTokenPayload {
  userId: string
}

export type AuthTokenResult =
  | { ok: true; userId: string; emailVerified: boolean }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'deleted'; email: string; deletedAt: Date }

/**
 * Verifies a JWT and checks the user exists and is not deleted.
 * Single DB query shared between HTTP middleware and WebSocket auth.
 */
export async function verifyAuthToken(token: string): Promise<AuthTokenResult> {
  let payload: { sub: string }
  try {
    payload = jwt.verify(token, getJwtSecret()) as { sub: string }
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { deletedAt: true, email: true, emailVerifiedAt: true, passwordHash: true },
  })

  if (!user) return { ok: false, reason: 'invalid' }
  if (user.deletedAt)
    return { ok: false, reason: 'deleted', email: user.email, deletedAt: user.deletedAt }

  return { ok: true, userId: payload.sub, emailVerified: isEmailVerified(user) }
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

function makeTokens(userId: string): Pick<AuthResponse, 'accessToken'> {
  const accessToken = jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
  return { accessToken }
}

function toAuthPayload(user: UserProfileRow & { passwordHash: string }): AuthResponse['user'] {
  return authUserPayload(user)
}

export function buildAuthResponse(user: UserProfileRow & { passwordHash: string }): AuthResponse {
  return { ...makeTokens(user.id), user: toAuthPayload(user) }
}

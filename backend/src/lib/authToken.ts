import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'
import { getJwtSecret } from './jwtSecret.js'
import { isEmailVerified } from './userPayload.js'

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
  if (user.deletedAt) return { ok: false, reason: 'deleted', email: user.email, deletedAt: user.deletedAt }

  return { ok: true, userId: payload.sub, emailVerified: isEmailVerified(user) }
}

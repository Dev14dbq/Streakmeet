import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../lib/jwtSecret.js'
import type { AuthResponse } from '../../types/api.js'
import { authUserPayload, type UserProfileRow } from '../../lib/userPayload.js'

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

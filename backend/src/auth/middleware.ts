import { type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { verifyAuthToken } from './token.js'
import { deletedAccountPayload } from '../common/account.js'
import { ErrorCodes, sendError } from '../common/errors.js'
import { prisma } from '../db/client.js'
import { isEmailVerified } from '../users/payload.js'

export interface AuthRequest extends Request {
  userId?: string
  emailVerified?: boolean
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 401, ErrorCodes.UNAUTHORIZED)
    return
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    sendError(res, 401, ErrorCodes.UNAUTHORIZED)
    return
  }

  const result = await verifyAuthToken(token)
  if (!result.ok) {
    if (result.reason === 'deleted') {
      res
        .status(403)
        .json(deletedAccountPayload({ email: result.email, deletedAt: result.deletedAt }))
    } else {
      sendError(res, 401, ErrorCodes.INVALID_TOKEN)
    }
    return
  }

  req.userId = result.userId
  req.emailVerified = result.emailVerified
  next()
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    next()
    return
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    next()
    return
  }

  const result = await verifyAuthToken(token)
  if (result.ok) {
    req.userId = result.userId
  }
  next()
}

export async function requireEmailVerified(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    sendError(res, 401, ErrorCodes.UNAUTHORIZED)
    return
  }
  if (req.emailVerified !== undefined) {
    if (!req.emailVerified) {
      sendError(res, 403, ErrorCodes.EMAIL_NOT_VERIFIED)
      return
    }
    next()
    return
  }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { emailVerifiedAt: true, passwordHash: true },
  })
  if (!user) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  if (!isEmailVerified(user)) {
    sendError(res, 403, ErrorCodes.EMAIL_NOT_VERIFIED)
    return
  }
  next()
}

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов', code: 'RATE_LIMITED' },
  validate: { xForwardedForHeader: false },
}

export const authRateLimit = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 10,
})

export const sensitiveAuthRateLimit = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60_000,
  max: 10,
})

/** For GPU/CPU-heavy endpoints (magic-meet, enroll-face, avatar). */
export const mediaRateLimit = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 5,
})

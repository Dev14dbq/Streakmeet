import type { Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'
import { isEmailVerified } from '../lib/userPayload.js'
import type { AuthRequest } from './auth.js'

export async function requireEmailVerified(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    sendError(res, 401, ErrorCodes.UNAUTHORIZED)
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

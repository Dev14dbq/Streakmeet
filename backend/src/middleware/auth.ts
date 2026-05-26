import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { deletedAccountPayload } from '../lib/accountDeletion.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'
import { getJwtSecret } from '../lib/jwtSecret.js'

export interface AuthRequest extends Request {
  userId?: string
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

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { deletedAt: true, email: true },
    })
    if (!user) {
      sendError(res, 401, ErrorCodes.UNAUTHORIZED)
      return
    }
    if (user.deletedAt) {
      res.status(403).json(deletedAccountPayload({ email: user.email, deletedAt: user.deletedAt }))
      return
    }
    req.userId = payload.sub
    next()
  } catch {
    sendError(res, 401, ErrorCodes.INVALID_TOKEN)
  }
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

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { deletedAt: true },
    })
    if (user && !user.deletedAt) {
      req.userId = payload.sub
    }
  } catch {
    // ignore invalid token for public routes
  }
  next()
}

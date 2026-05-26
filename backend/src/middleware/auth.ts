import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { getJwtSecret } from '../lib/jwtSecret.js'

export interface AuthRequest extends Request {
  userId?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { deletedAt: true },
    })
    if (!user || user.deletedAt) {
      res.status(401).json({
        error: user?.deletedAt ? 'Account deleted' : 'Unauthorized',
        code: user?.deletedAt ? 'ACCOUNT_DELETED' : undefined,
      })
      return
    }
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
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

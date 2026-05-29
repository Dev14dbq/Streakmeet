import { type Request, type Response, type NextFunction } from 'express'
import { verifyAuthToken } from '../lib/authToken.js'
import { deletedAccountPayload } from '../lib/accountDeletion.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'

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
      res.status(403).json(deletedAccountPayload({ email: result.email, deletedAt: result.deletedAt }))
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

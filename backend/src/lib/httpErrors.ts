import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ErrorCodes, type ErrorCode, prismaErrorCode, sendError } from './apiErrors.js'
import { deletedAccountPayload } from './accountDeletion.js'

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message?: string,
    public extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiHttpError'
  }
}

export class DeletedAccountPendingError extends Error {
  readonly body: ReturnType<typeof deletedAccountPayload>

  constructor(user: { email: string; deletedAt: Date }) {
    super('account_deleted')
    this.name = 'DeletedAccountPendingError'
    this.body = deletedAccountPayload(user)
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidBase64Image(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }

  console.error('[api]', err)

  if (err instanceof DeletedAccountPendingError) {
    res.status(403).json(err.body)
    return
  }

  if (err instanceof ApiHttpError) {
    sendError(res, err.status, err.code, err.message, err.extra)
    return
  }

  const prismaErr = prismaErrorCode(err)
  if (prismaErr) {
    sendError(res, prismaErr.status, prismaErr.code)
    return
  }

  sendError(res, 500, ErrorCodes.INTERNAL_ERROR)
}

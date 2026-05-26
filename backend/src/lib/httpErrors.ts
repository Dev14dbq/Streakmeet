import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ErrorCodes, prismaErrorCode, sendError, faceErrorFromException } from './apiErrors.js'

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

/** @deprecated use faceErrorFromException from apiErrors */
export function faceErrorMessage(err: unknown): string {
  return faceErrorFromException(err).message
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }

  console.error('[api]', err)

  const prismaErr = prismaErrorCode(err)
  if (prismaErr) {
    sendError(res, prismaErr.status, prismaErr.code)
    return
  }

  sendError(res, 500, ErrorCodes.INTERNAL_ERROR)
}

import { ErrorCodes } from '../../lib/apiErrors.js'
import { ApiHttpError, DeletedAccountPendingError } from '../../lib/httpErrors.js'

/** @deprecated use ApiHttpError directly */
export class AuthServiceError extends ApiHttpError {
  constructor(
    status: number,
    code: (typeof ErrorCodes)[keyof typeof ErrorCodes],
    message?: string,
    extra?: Record<string, unknown>
  ) {
    super(status, code, message, extra)
    this.name = 'AuthServiceError'
  }
}

export { DeletedAccountPendingError }

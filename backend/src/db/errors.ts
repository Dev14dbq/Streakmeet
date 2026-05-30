import { ErrorCodes } from '../common/errors.js'

export function prismaErrorCode(
  err: unknown
): { status: number; code: (typeof ErrorCodes)[keyof typeof ErrorCodes] } | null {
  const prismaCode = (err as { code?: string })?.code
  if (prismaCode === 'P2002') return { status: 409, code: ErrorCodes.DUPLICATE_RECORD }
  if (prismaCode === 'P2025') return { status: 404, code: ErrorCodes.NOT_FOUND }
  if (prismaCode === 'P2003') return { status: 400, code: ErrorCodes.INVALID_REFERENCE }
  return null
}

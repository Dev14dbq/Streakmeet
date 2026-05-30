import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { acceptCurrentLegalForUser, getLegalStatusForUser } from '../lib/legalDocuments.js'

import { ErrorCodes, sendError } from '../lib/apiErrors.js'
import { asyncHandler } from '../lib/httpErrors.js'
import { getLegalDocument } from '../services/legalService.js'

const router = Router()

function slugParamToEnum(slug: string): 'TERMS' | 'PRIVACY' | null {
  if (slug === 'terms') return 'TERMS'
  if (slug === 'privacy') return 'PRIVACY'
  return null
}

// GET /api/legal/status/me
router.get(
  '/status/me',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const status = await getLegalStatusForUser(req.userId!)
    if (!status) {
      sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
      return
    }
    res.json(status)
  })
)

// POST /api/legal/accept
router.post(
  '/accept',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const accepted = await acceptCurrentLegalForUser(req.userId!)
    res.json({ ok: true, ...accepted })
  })
)

// GET /api/legal/terms | /api/legal/privacy
router.get(
  '/:slug',
  asyncHandler(async (req, res: Response) => {
    const slug = slugParamToEnum(String(req.params.slug ?? '').toLowerCase())
    if (!slug) {
      sendError(res, 404, ErrorCodes.LEGAL_DOCUMENT_NOT_FOUND)
      return
    }
    const rawLocale =
      typeof req.query.locale === 'string'
        ? req.query.locale
        : req.headers['accept-language']?.split(',')[0]
    res.json(await getLegalDocument(slug, rawLocale))
  })
)

export default router

import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { acceptCurrentLegalForUser, getLegalStatusForUser } from '../lib/legalDocuments.js'
import { getLocalizedLegal, normalizeLegalLocale } from '../lib/legalTranslations.js'
import type { LegalConsentStatus, LegalDocument } from '../types/api.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'

const router = Router()

function slugParamToEnum(slug: string): 'TERMS' | 'PRIVACY' | null {
  if (slug === 'terms') return 'TERMS'
  if (slug === 'privacy') return 'PRIVACY'
  return null
}

// GET /api/legal/status/me
router.get('/status/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const status = await getLegalStatusForUser(req.userId!)
  if (!status) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  res.json(status)
})

// POST /api/legal/accept
router.post('/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const accepted = await acceptCurrentLegalForUser(req.userId!)
  res.json({ ok: true, ...accepted })
})

// GET /api/legal/terms | /api/legal/privacy
router.get('/:slug', async (req, res: Response) => {
  const slug = slugParamToEnum(String(req.params.slug ?? '').toLowerCase())
  if (!slug) {
    sendError(res, 404, ErrorCodes.LEGAL_DOCUMENT_NOT_FOUND)
    return
  }

  const doc = await prisma.legalDocument.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      version: true,
      content: true,
      updatedAt: true,
    },
  })

  if (!doc) {
    sendError(res, 404, ErrorCodes.LEGAL_DOCUMENT_NOT_FOUND)
    return
  }

  const locale = normalizeLegalLocale(
    typeof req.query.locale === 'string'
      ? req.query.locale
      : req.headers['accept-language']?.split(',')[0]
  )
  const localized = getLocalizedLegal(slug, locale, doc.content)

  res.json({
    slug: slug === 'TERMS' ? 'terms' : 'privacy',
    title: localized.title,
    version: doc.version,
    content: localized.content,
    updatedAt: doc.updatedAt.toISOString(),
  } satisfies LegalDocument)
})

export default router

import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { acceptCurrentLegalForUser, getLegalStatusForUser } from '../lib/legalDocuments.js'

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
    res.status(404).json({ error: 'User not found' })
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
    res.status(404).json({ error: 'Document not found' })
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
    res.status(404).json({ error: 'Document not found' })
    return
  }

  res.json({
    slug: slug === 'TERMS' ? 'terms' : 'privacy',
    title: doc.title,
    version: doc.version,
    content: doc.content,
    updatedAt: doc.updatedAt,
  })
})

export default router

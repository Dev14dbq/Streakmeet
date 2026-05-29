import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { asyncHandler } from '../lib/httpErrors.js'
import { parsePagination } from '../lib/pagination.js'
import { getMemoriesFeed } from '../services/memoriesService.js'

function optionalQueryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

const router = Router()
router.use(requireAuth, requireEmailVerified)

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parsePagination(req.query, { limit: 20, maxLimit: 50 })
    const streakId = optionalQueryString(req.query.streakId)
    res.json(await getMemoriesFeed(req.userId!, page, limit, streakId))
  })
)

export default router

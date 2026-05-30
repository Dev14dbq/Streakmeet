import { Router, type Response } from 'express'
import { requireAuth, requireEmailVerified, type AuthRequest } from '../auth/middleware.js'
import { asyncHandler } from '../common/errors.js'
import { parsePagination } from '../common/helpers.js'
import { getMemoriesFeed } from './feed.js'

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

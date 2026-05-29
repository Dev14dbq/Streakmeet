import { Router, type Response } from 'express'
import { optionalAuth, type AuthRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/httpErrors.js'
import { parsePagination } from '../lib/pagination.js'
import { getUserPhotosForProfile, getUserProfile } from '../services/publicProfileService.js'
import { routeParam } from '../lib/routeParams.js'

const router = Router()

router.get(
  '/users/:nickname',
  optionalAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await getUserProfile(req.userId, routeParam(req.params.nickname)))
  })
)

router.get(
  '/users/:nickname/photos',
  optionalAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parsePagination(req.query)
    res.json(
      await getUserPhotosForProfile(req.userId, routeParam(req.params.nickname), page, limit)
    )
  })
)

export default router

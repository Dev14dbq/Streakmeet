import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { asyncHandler } from '../lib/httpErrors.js'
import { acceptFriend, listFriends, requestFriend } from '../services/friendService.js'

const router = Router()
router.use(requireAuth, requireEmailVerified)

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await listFriends(req.userId!))
  })
)

router.post(
  '/request',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { friendId } = req.body as { friendId?: string }
    res.json(await requestFriend(req.userId!, friendId))
  })
)

router.post(
  '/accept',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { friendshipId } = req.body as { friendshipId?: string }
    res.json(await acceptFriend(req.userId!, friendshipId))
  })
)

export default router

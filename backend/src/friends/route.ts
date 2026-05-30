import { Router, type Response } from 'express'
import { requireAuth, requireEmailVerified, type AuthRequest } from '../auth/middleware.js'
import { asyncHandler } from '../common/errors.js'
import { acceptFriend, listFriends, requestFriend } from './service.js'

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

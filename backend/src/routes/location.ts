import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { asyncHandler } from '../lib/httpErrors.js'
import {
  getFriendsLocations,
  getMyLocation,
  setLocationSharing,
  updateLocation,
} from '../services/locationService.js'

const router = Router()
router.use(requireAuth, requireEmailVerified)

router.get(
  '/me',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await getMyLocation(req.userId!))
  })
)

router.get(
  '/friends',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await getFriendsLocations(req.userId!))
  })
)

router.post(
  '/sharing',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { enabled } = req.body as { enabled?: boolean }
    res.json(await setLocationSharing(req.userId!, enabled))
  })
)

router.post(
  '/update',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { latitude, longitude } = req.body as {
      latitude?: number
      longitude?: number
    }
    res.json(await updateLocation(req.userId!, latitude, longitude))
  })
)

export default router

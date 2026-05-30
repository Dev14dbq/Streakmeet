import { Router, type Response } from 'express'
import {
  requireAuth,
  requireEmailVerified,
  type AuthRequest,
  mediaRateLimit,
} from '../auth/middleware.js'
import { asyncHandler } from '../common/errors.js'
import { parsePagination } from '../common/helpers.js'
import {
  deleteAccount,
  getProfile,
  listPhotos,
  searchUsers,
  updateEmail,
  updatePassword,
  updatePreferences,
  updatePublic,
  updateSettings,
  uploadAvatar,
} from './service.js'

const router = Router()
router.use(requireAuth)

router.get(
  '/me',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await getProfile(req.userId!))
  })
)

router.delete(
  '/me',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await deleteAccount(req.userId!))
  })
)

router.use(requireEmailVerified)

router.patch(
  '/settings',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { timezone } = req.body as { timezone?: string }
    res.json(await updateSettings(req.userId!, timezone))
  })
)

router.patch(
  '/preferences',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { notifyFriends, notifyMeet, geoOnPhotos } = req.body as {
      notifyFriends?: boolean
      notifyMeet?: boolean
      geoOnPhotos?: boolean
    }
    res.json(await updatePreferences(req.userId!, { notifyFriends, notifyMeet, geoOnPhotos }))
  })
)

router.patch(
  '/email',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, currentPassword } = req.body as { email?: string; currentPassword?: string }
    res.json(await updateEmail(req.userId!, email, currentPassword))
  })
)

router.patch(
  '/password',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string
      newPassword?: string
    }
    res.json(await updatePassword(req.userId!, currentPassword, newPassword))
  })
)

router.patch(
  '/public',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { isPublic } = req.body as { isPublic?: boolean }
    res.json(await updatePublic(req.userId!, isPublic))
  })
)

router.post(
  '/avatar',
  mediaRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { photoBase64 } = req.body as { photoBase64?: string }
    res.json(await uploadAvatar(req.userId!, photoBase64))
  })
)

router.get(
  '/photos',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parsePagination(req.query)
    res.json(await listPhotos(req.userId!, page, limit))
  })
)

router.get(
  '/search',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { q } = req.query
    res.json(await searchUsers(req.userId!, typeof q === 'string' ? q : undefined))
  })
)

export default router

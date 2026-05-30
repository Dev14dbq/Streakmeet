import { Router, type Response } from 'express'
import {
  requireAuth,
  requireEmailVerified,
  type AuthRequest,
  mediaRateLimit,
} from '../auth/middleware.js'
import { asyncHandler } from '../common/errors.js'
import { ErrorCodes, sendError } from '../common/errors.js'
import { parsePagination } from '../common/helpers.js'
import { routeParam } from '../common/helpers.js'
import { createStreak, getStreakDetail, listStreaks, remindPartner } from './service.js'
import { processMagicMeet } from './magicMeet.js'
import { initRemoteSelfie, replyRemoteSelfie } from './remoteSelfie.js'

const router = Router()
router.use(requireAuth, requireEmailVerified)

// GET /api/streaks
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await listStreaks(req.userId!))
  })
)

// POST /api/streaks
router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { partnerId } = req.body as { partnerId?: string }
    res.json(await createStreak(req.userId!, partnerId ?? ''))
  })
)

// POST /api/streaks/magic-meet
router.post(
  '/magic-meet',
  mediaRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { photoBase64, photosBase64, location } = req.body as {
      photoBase64?: string
      photosBase64?: string[]
      location?: { lat: number; lng: number }
    }
    res.json(await processMagicMeet(req.userId!, { photoBase64, photosBase64, location }))
  })
)

// POST /api/streaks/:partnerNickname/remind
router.post(
  '/:partnerNickname/remind',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await remindPartner(req.userId!, routeParam(req.params.partnerNickname).toLowerCase()))
  })
)

// POST /api/streaks/:streakId/remote-selfie/init
router.post(
  '/:streakId/remote-selfie/init',
  mediaRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { photoBase64 } = req.body as { photoBase64?: string }
    if (!photoBase64) {
      sendError(res, 400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
      return
    }
    res.json(await initRemoteSelfie(req.userId!, routeParam(req.params.streakId), photoBase64))
  })
)

// POST /api/streaks/:streakId/remote-selfie/reply/:requestId
router.post(
  '/:streakId/remote-selfie/reply/:requestId',
  mediaRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { photoBase64 } = req.body as { photoBase64?: string }
    if (!photoBase64) {
      sendError(res, 400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
      return
    }
    res.json(
      await replyRemoteSelfie(
        req.userId!,
        routeParam(req.params.streakId),
        routeParam(req.params.requestId),
        photoBase64
      )
    )
  })
)

// GET /api/streaks/:partnerNickname
router.get(
  '/:partnerNickname',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit } = parsePagination(req.query, { limit: 10, maxLimit: 30 })
    res.json(
      await getStreakDetail(req.userId!, routeParam(req.params.partnerNickname), page, limit)
    )
  })
)

export default router

import { Router, type Response, type Request } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { saveBase64ImageAsAvif } from '../lib/saveImage.js'
import { isValidBase64Image } from '../lib/httpErrors.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'
import { isValidTimezone } from '../lib/timezone.js'
import { findUserByEmail } from '../lib/accountDeletion.js'
import { parsePagination } from '../lib/pagination.js'
import { reconcileStreakTimezonesForUser } from '../lib/streakCalendar.js'

const router = Router()
router.use(requireAuth)

// GET /api/users/me
router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      nickname: true,
      qrCodeId: true,
      gemsBalance: true,
      faceEnrolled: true,
      avatarUrl: true,
      timezone: true,
      isPublic: true,
    },
  })
  if (!user) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  res.json(user)
})

// PATCH /api/users/settings
router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const { timezone } = req.body as { timezone?: string }
  if (!timezone || typeof timezone !== 'string') {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  try {
    if (!isValidTimezone(timezone)) throw new Error('invalid')
  } catch {
    sendError(res, 400, ErrorCodes.INVALID_TIMEZONE)
    return
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { timezone },
    select: {
      id: true,
      email: true,
      nickname: true,
      qrCodeId: true,
      gemsBalance: true,
      faceEnrolled: true,
      avatarUrl: true,
      timezone: true,
      isPublic: true,
    },
  })
  await reconcileStreakTimezonesForUser(req.userId!)
  res.json(user)
})
router.patch('/email', async (req: AuthRequest, res: Response) => {
  const { email } = req.body as { email?: string }
  if (!email || !email.includes('@')) {
    sendError(res, 400, ErrorCodes.INVALID_EMAIL)
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing && existing.id !== req.userId) {
    sendError(res, 409, ErrorCodes.EMAIL_ALREADY_IN_USE)
    return
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      nickname: true,
      qrCodeId: true,
      gemsBalance: true,
      faceEnrolled: true,
      avatarUrl: true,
      timezone: true,
      isPublic: true,
    },
  })
  res.json(user)
})

// PATCH /api/users/public
router.patch('/public', async (req: AuthRequest, res: Response) => {
  const { isPublic } = req.body as { isPublic?: boolean }
  if (typeof isPublic !== 'boolean') {
    sendError(res, 400, ErrorCodes.INVALID_BOOLEAN)
    return
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { isPublic },
    select: {
      id: true,
      email: true,
      nickname: true,
      qrCodeId: true,
      gemsBalance: true,
      faceEnrolled: true,
      avatarUrl: true,
      timezone: true,
      isPublic: true,
    },
  })
  res.json(user)
})

// POST /api/users/avatar
router.post('/avatar', async (req: AuthRequest, res: Response) => {
  const { photoBase64 } = req.body as { photoBase64?: string }
  if (!isValidBase64Image(photoBase64)) {
    sendError(res, 400, ErrorCodes.INVALID_PHOTO)
    return
  }

  try {
    const avatarUrl = await saveBase64ImageAsAvif(photoBase64, `avatar_${req.userId}_${Date.now()}`)
    await prisma.user.update({
      where: { id: req.userId },
      data: { avatarUrl },
    })

    res.json({ avatarUrl })
  } catch (e) {
    console.error('Avatar upload error:', e)
    sendError(res, 500, ErrorCodes.AVATAR_SAVE_FAILED)
  }
})

// GET /api/users/photos
router.get('/photos', async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query)

  const streaks = await prisma.streak.findMany({
    where: {
      OR: [{ userAId: req.userId }, { userBId: req.userId }],
    },
    select: { id: true },
  })
  const streakIds = streaks.map((s) => s.id)

  const photos = await prisma.meetProof.findMany({
    where: {
      streakDay: {
        streakId: { in: streakIds },
      },
    },
    include: {
      uploadedBy: { select: { id: true, nickname: true } },
      streakDay: {
        select: {
          streak: {
            select: {
              userA: { select: { id: true, nickname: true } },
              userB: { select: { id: true, nickname: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
  res.json(photos)
})

// GET /api/users/search?q=...
router.get('/search', async (req: AuthRequest, res: Response) => {
  const { q } = req.query
  if (!q || typeof q !== 'string') {
    res.json([])
    return
  }

  const query = q.toLowerCase().trim()

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      NOT: { id: req.userId },
      OR: [
        { nickname: { contains: query, mode: 'insensitive' } },
        { qrCodeId: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nickname: true, avatarUrl: true, qrCodeId: true },
    take: 10,
    orderBy: { nickname: 'asc' },
  })

  res.json(users)
})

// DELETE /api/users/me — soft delete (30-day retention)
router.delete('/me', async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { deletedAt: new Date() },
  })
  res.json({ success: true })
})

export default router

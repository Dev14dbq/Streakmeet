import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { requireEmailVerified } from '../middleware/requireEmailVerified.js'
import { prisma } from '../lib/prisma.js'
import { saveBase64ImageAsAvif } from '../lib/saveImage.js'
import { isValidBase64Image } from '../lib/httpErrors.js'
import { ErrorCodes, sendError } from '../lib/apiErrors.js'
import { isValidTimezone } from '../lib/timezone.js'
import { findUserByEmail } from '../lib/accountDeletion.js'
import { parsePagination } from '../lib/pagination.js'
import { reconcileStreakTimezonesForUser } from '../lib/streakCalendar.js'
import { userProfileSelect, userProfilePayload } from '../lib/userPayload.js'
import { issueEmailVerification } from '../lib/emailVerify.js'

const router = Router()
router.use(requireAuth)

// GET /api/users/me — доступен до подтверждения email
router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: userProfileSelect,
  })
  if (!user) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  res.json(userProfilePayload(user))
})

// DELETE /api/users/me — доступен до подтверждения email
router.delete('/me', async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.userId },
    data: { deletedAt: new Date() },
  })
  res.json({ success: true })
})

router.use(requireEmailVerified)

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
    select: userProfileSelect,
  })
  await reconcileStreakTimezonesForUser(req.userId!)
  res.json(userProfilePayload(user))
})

// PATCH /api/users/preferences
router.patch('/preferences', async (req: AuthRequest, res: Response) => {
  const { notifyFriends, notifyMeet, geoOnPhotos } = req.body as {
    notifyFriends?: boolean
    notifyMeet?: boolean
    geoOnPhotos?: boolean
  }
  const data: Record<string, boolean> = {}
  if (typeof notifyFriends === 'boolean') data.notifyFriends = notifyFriends
  if (typeof notifyMeet === 'boolean') data.notifyMeet = notifyMeet
  if (typeof geoOnPhotos === 'boolean') data.geoOnPhotos = geoOnPhotos
  if (Object.keys(data).length === 0) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data,
    select: userProfileSelect,
  })
  res.json(userProfilePayload(user))
})

router.patch('/email', async (req: AuthRequest, res: Response) => {
  const { email, currentPassword } = req.body as { email?: string; currentPassword?: string }
  if (!email || !email.includes('@')) {
    sendError(res, 400, ErrorCodes.INVALID_EMAIL)
    return
  }
  if (!currentPassword) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing && existing.id !== req.userId) {
    sendError(res, 409, ErrorCodes.EMAIL_ALREADY_IN_USE)
    return
  }

  const current = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { passwordHash: true },
  })
  if (!current) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  if (!current.passwordHash) {
    sendError(res, 400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)
    return
  }
  const validPassword = await bcrypt.compare(currentPassword, current.passwordHash)
  if (!validPassword) {
    sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
    return
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      email: normalizedEmail,
      ...(current?.passwordHash ? { emailVerifiedAt: null, emailVerifyToken: null } : {}),
    },
    select: userProfileSelect,
  })

  if (current?.passwordHash) {
    try {
      await issueEmailVerification(req.userId!, normalizedEmail)
    } catch (e) {
      console.error('[users/email] verification send failed:', e)
    }
  }

  res.json(userProfilePayload(user))
})

router.patch('/password', async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }
  if (!currentPassword || !newPassword) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  if (newPassword.length < 6) {
    sendError(res, 400, ErrorCodes.PASSWORD_TOO_SHORT)
    return
  }

  const current = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { passwordHash: true },
  })
  if (!current) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }
  if (!current.passwordHash) {
    sendError(res, 400, ErrorCodes.OAUTH_ACCOUNT_NO_PASSWORD)
    return
  }
  const validPassword = await bcrypt.compare(currentPassword, current.passwordHash)
  if (!validPassword) {
    sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
    return
  }

  await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  })
  res.json({ success: true })
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
    select: userProfileSelect,
  })
  res.json(userProfilePayload(user))
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

export default router

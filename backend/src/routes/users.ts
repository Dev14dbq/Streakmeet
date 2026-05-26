import { Router, type Response, type Request } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { saveBase64ImageAsAvif } from '../lib/saveImage.js'
import { isValidTimezone } from '../lib/timezone.js'
import { findUserByEmail } from '../lib/accountDeletion.js'

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
    },
  })
  res.json(user)
})

// PATCH /api/users/settings
router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const { timezone } = req.body as { timezone?: string }
  if (!timezone || typeof timezone !== 'string') {
    res.status(400).json({ error: 'timezone is required' })
    return
  }
  try {
    if (!isValidTimezone(timezone)) throw new Error('invalid')
  } catch {
    res.status(400).json({ error: 'Invalid timezone' })
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
    },
  })
  res.json(user)
})

// PATCH /api/users/email
router.patch('/email', async (req: AuthRequest, res: Response) => {
  const { email } = req.body as { email?: string }
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Некорректный email' })
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await findUserByEmail(normalizedEmail)
  if (existing && existing.id !== req.userId) {
    res.status(409).json({ error: 'Этот email уже занят' })
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
    },
  })
  res.json(user)
})

// POST /api/users/avatar
router.post('/avatar', async (req: AuthRequest, res: Response) => {
  const { photoBase64 } = req.body as { photoBase64?: string }
  if (!photoBase64) {
    res.status(400).json({ error: 'Фото обязательно' })
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
    res.status(500).json({ error: 'Ошибка сохранения аватара' })
  }
})

// GET /api/users/photos
router.get('/photos', async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 12

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
    select: { id: true, nickname: true, avatarUrl: true },
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

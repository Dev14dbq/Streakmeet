import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { notifyUser } from '../lib/socket.js'
import {
  saveBase64ImageAsAvif,
  computePhotoHash,
  combineRemoteSelfieImages,
  hashImageFile,
} from '../lib/saveImage.js'
import {
  detectFacesFromBase64,
  ensureFaceService,
  isFaceMatch,
  isLegacyEmbedding,
  legacyEmbeddingMessage,
} from '../lib/face.js'
import { getLocalDateString, normalizeTimezone } from '../lib/timezone.js'
import { expireStaleRemoteSelfieRequests, REMOTE_SELFIE_TTL_MS } from '../lib/remoteSelfie.js'
import { parsePagination } from '../lib/pagination.js'

const router = Router()
router.use(requireAuth)

async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  return normalizeTimezone(user?.timezone)
}

// GET /api/streaks
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!

  const streaks = await prisma.streak.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      active: true,
    },
    include: {
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })

  const formatted = streaks.map((s) => {
    const isUserA = s.userAId === userId
    const partner = isUserA ? s.userB : s.userA
    return {
      id: s.id,
      count: s.count,
      lastMetDate: s.lastMetDate,
      partner,
    }
  })

  res.json(formatted)
})

// POST /api/streaks
router.post('/', async (req: AuthRequest, res: Response) => {
  const { partnerId } = req.body
  const userId = req.userId!

  // Проверяем, друзья ли они
  const isFriend = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userAId: userId, userBId: partnerId },
        { userAId: partnerId, userBId: userId },
      ],
    },
  })

  if (!isFriend) {
    res.status(400).json({ error: 'You must be friends to start a streak' })
    return
  }

  // Проверяем, нет ли уже серии
  const existing = await prisma.streak.findFirst({
    where: {
      active: true,
      OR: [
        { userAId: userId, userBId: partnerId },
        { userAId: partnerId, userBId: userId },
      ],
    },
  })

  if (existing) {
    res.status(400).json({ error: 'Streak already exists' })
    return
  }

  const streak = await prisma.streak.create({
    data: {
      userAId: userId,
      userBId: partnerId,
      count: 0,
      timezone: await getUserTimezone(userId),
    },
  })

  res.json(streak)
})

// POST /api/streaks/magic-meet
router.post('/magic-meet', async (req: AuthRequest, res: Response) => {
  const t0 = Date.now()
  const userId = req.userId!
  const { photoBase64, location } = req.body as {
    photoBase64?: string
    location?: { lat: number; lng: number }
  }

  console.log(
    `[magic-meet] request from user ${userId}, photo=${photoBase64 ? `${Math.round(photoBase64.length / 1024)}KB` : 'missing'}`
  )

  if (!photoBase64) {
    console.log('[magic-meet] rejected: no photo')
    res.status(400).json({ error: 'Фото обязательно' })
    return
  }

  const currentUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!currentUser?.faceEmbedding) {
    console.log('[magic-meet] rejected: face not enrolled')
    res.status(400).json({ error: 'Сначала зарегистрируй лицо в профиле' })
    return
  }

  const userTimezone = normalizeTimezone(currentUser.timezone)
  const today = getLocalDateString(userTimezone)

  let descriptors: number[][]
  try {
    await ensureFaceService()
    const detections = await detectFacesFromBase64(photoBase64)
    descriptors = detections.map((d) => d.embedding)
  } catch (e) {
    console.error('[magic-meet] face detection failed', e)
    res.status(500).json({ error: 'Ошибка распознавания лиц на сервере' })
    return
  }

  if (descriptors.length < 2) {
    console.log(`[magic-meet] rejected: only ${descriptors.length} face(s)`)
    res
      .status(400)
      .json({ error: `На фото должно быть минимум 2 лица (найдено: ${descriptors.length})` })
    return
  }

  const myDesc = currentUser.faceEmbedding as number[]
  if (isLegacyEmbedding(myDesc)) {
    console.log('[magic-meet] rejected: legacy embedding')
    res.status(400).json({ error: legacyEmbeddingMessage() })
    return
  }

  // 1. Проверяем, есть ли Я на фото
  let amIPresent = false
  let myDescIndex = -1
  for (let i = 0; i < descriptors.length; i++) {
    if (isFaceMatch(descriptors[i]!, myDesc)) {
      amIPresent = true
      myDescIndex = i
      break
    }
  }

  if (!amIPresent) {
    console.log('[magic-meet] rejected: user not found on photo')
    res.status(400).json({ error: 'Мы не нашли тебя на фото!' })
    return
  }

  console.log(`[magic-meet] user found at index ${myDescIndex}, matching friends...`)

  const photoHash = await computePhotoHash(photoBase64)

  // 2. Ищем серии с друзьями, которые тоже есть на фото
  const activeStreaks = await prisma.streak.findMany({
    where: { active: true, OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: true, userB: true },
  })

  const extendedStreaks: { nickname: string; avatarUrl: string | null }[] = []
  const addedPhotos: { nickname: string; avatarUrl: string | null }[] = []
  const duplicatePartners: string[] = []
  let savedPhotoUrl: string | null = null

  for (const streak of activeStreaks) {
    const partner = streak.userAId === userId ? streak.userB : streak.userA
    if (!partner.faceEmbedding) continue
    const partnerDesc = partner.faceEmbedding as number[]
    if (isLegacyEmbedding(partnerDesc)) continue

    // Ищем партнера на фото (кроме моего лица)
    let partnerFound = false
    for (let i = 0; i < descriptors.length; i++) {
      if (i === myDescIndex) continue
      if (isFaceMatch(descriptors[i]!, partnerDesc)) {
        partnerFound = true
        break
      }
    }

    if (!partnerFound) continue

    let streakDay = await prisma.streakDay.findUnique({
      where: { streakId_date: { streakId: streak.id, date: today } },
    })

    if (streakDay) {
      const duplicate = await prisma.meetProof.findFirst({
        where: { streakDayId: streakDay.id, photoHash },
      })
      if (duplicate) {
        duplicatePartners.push(partner.nickname)
        continue
      }
    }

    if (!savedPhotoUrl) {
      savedPhotoUrl = await saveBase64ImageAsAvif(photoBase64, `${Date.now()}_${userId}`)
    }

    const alreadyMetToday = streak.lastMetDate === today

    if (!alreadyMetToday) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { count: { increment: 1 }, lastMetDate: today },
      })

      await prisma.user.updateMany({
        where: { id: { in: [streak.userAId, streak.userBId] } },
        data: { gemsBalance: { increment: 1 } },
      })

      notifyUser(partner.id, 'notification', {
        message: `Ты и ${currentUser.nickname} встретились! Серия продлена 🔥`,
        route: '/',
      })
      extendedStreaks.push({ nickname: partner.nickname, avatarUrl: partner.avatarUrl })
    } else {
      notifyUser(partner.id, 'notification', {
        message: `${currentUser.nickname} добавил(а) новое фото встречи 📸`,
        route: '/',
      })
      addedPhotos.push({ nickname: partner.nickname, avatarUrl: partner.avatarUrl })
    }

    if (!streakDay) {
      streakDay = await prisma.streakDay.create({
        data: { streakId: streak.id, date: today, status: 'MET' },
      })
    }

    await prisma.meetProof.create({
      data: {
        streakDayId: streakDay.id,
        uploadedById: userId,
        photoUrl: savedPhotoUrl,
        photoHash,
        latitude: location?.lat,
        longitude: location?.lng,
        facesDetected: descriptors.length,
      },
    })
  }

  const allPartners = [...extendedStreaks, ...addedPhotos]

  if (allPartners.length === 0) {
    if (duplicatePartners.length > 0) {
      console.log(`[magic-meet] rejected: duplicate photo for ${duplicatePartners.join(', ')}`)
      res.status(400).json({
        error: `Это фото уже было добавлено${duplicatePartners.length === 1 ? ` (с @${duplicatePartners[0]})` : ''}`,
      })
      return
    }
    console.log(
      `[magic-meet] rejected: no matching friends (${activeStreaks.length} active streaks checked)`
    )
    res.status(400).json({
      error: 'Мы не распознали твоих друзей из активных серий на этом фото.',
    })
    return
  }

  const parts: string[] = []
  if (extendedStreaks.length > 0) {
    parts.push(`Продлены серии с: ${extendedStreaks.map((p) => p.nickname).join(', ')}`)
  }
  if (addedPhotos.length > 0) {
    parts.push(`Добавлены фото с: ${addedPhotos.map((p) => p.nickname).join(', ')}`)
  }
  if (duplicatePartners.length > 0) {
    parts.push(`Пропущены (дубликат): ${duplicatePartners.join(', ')}`)
  }

  console.log(
    `[magic-meet] success: ${allPartners.map((p) => p.nickname).join(', ')} (+${Date.now() - t0}ms)`
  )
  res.json({
    message: parts.join('. '),
    partners: allPartners,
  })
})

// POST /api/streaks/:partnerNickname/remind — пинг партнёру продлить серию (можно спамить)
router.post('/:partnerNickname/remind', async (req: AuthRequest, res: Response) => {
  const param = String(
    Array.isArray(req.params.partnerNickname)
      ? req.params.partnerNickname[0]
      : req.params.partnerNickname
  ).toLowerCase()
  const userId = req.userId!

  const partner = await prisma.user.findFirst({
    where: { nickname: param, deletedAt: null },
    select: { id: true, nickname: true },
  })
  if (!partner) {
    res.status(404).json({ error: 'Streak not found' })
    return
  }

  const streak = await prisma.streak.findFirst({
    where: {
      active: true,
      OR: [
        { userAId: userId, userBId: partner.id },
        { userAId: partner.id, userBId: userId },
      ],
    },
  })
  if (!streak) {
    res.status(404).json({ error: 'Streak not found' })
    return
  }

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true, timezone: true },
  })
  if (!sender) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const today = getLocalDateString(sender.timezone)
  if (streak.lastMetDate === today) {
    res.status(400).json({ error: 'Streak already extended today' })
    return
  }

  const pings = [
    `🔔 @${sender.nickname} напоминает: продли серию!`,
    `🔥 @${sender.nickname}: где ты? Серия горит!`,
    `📣 @${sender.nickname} пушит — встречаемся сегодня!`,
    `⚡ @${sender.nickname}: серия не ждёт! Бегом!`,
    `💥 @${sender.nickname} заспамил напоминание — иди встречайся!`,
  ]
  const message = pings[Math.floor(Math.random() * pings.length)]!

  notifyUser(partner.id, 'notification', {
    type: 'streak_remind',
    message,
    route: `/streaks/${sender.nickname}`,
  })

  res.json({ ok: true })
})

// POST /api/streaks/:streakId/remote-selfie/init
router.post('/:streakId/remote-selfie/init', async (req: AuthRequest, res: Response) => {
  const streakId = String(req.params.streakId)
  const { photoBase64 } = req.body as { photoBase64?: string }
  const userId = req.userId!

  if (!photoBase64) {
    res.status(400).json({ error: 'Фото обязательно' })
    return
  }

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include: { userA: true, userB: true },
  })

  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    res.status(404).json({ error: 'Серия не найдена' })
    return
  }

  const partnerId = streak.userAId === userId ? streak.userBId : streak.userAId
  const partner = streak.userAId === userId ? streak.userB : streak.userA
  const sender = streak.userAId === userId ? streak.userA : streak.userB

  await expireStaleRemoteSelfieRequests(streak.id)

  const existingPending = await prisma.remoteSelfieRequest.findFirst({
    where: { streakId: streak.id, status: 'PENDING' },
  })
  if (existingPending) {
    res.status(409).json({ error: 'Уже есть активный запрос на селфи' })
    return
  }

  const savedPhotoUrl = await saveBase64ImageAsAvif(
    photoBase64,
    `remote_selfie_${Date.now()}_${userId}`
  )

  const request = await prisma.remoteSelfieRequest.create({
    data: {
      streakId: streak.id,
      senderId: userId,
      receiverId: partnerId,
      senderPhotoUrl: savedPhotoUrl,
    },
  })

  notifyUser(partnerId, 'notification', {
    type: 'remote_selfie_request',
    message: `📸 @${sender.nickname} хочет сделать совместное селфи на расстоянии!`,
    route: `/streaks/${sender.nickname}`,
  })

  res.json(request)
})

// POST /api/streaks/:streakId/remote-selfie/reply/:requestId
router.post(
  '/:streakId/remote-selfie/reply/:requestId',
  async (req: AuthRequest, res: Response) => {
    const streakId = String(req.params.streakId)
    const requestId = String(req.params.requestId)
    const { photoBase64 } = req.body as { photoBase64?: string }
    const userId = req.userId!

    if (!photoBase64) {
      res.status(400).json({ error: 'Фото обязательно' })
      return
    }

    const request = await prisma.remoteSelfieRequest.findUnique({
      where: { id: requestId },
      include: { sender: true },
    })

    if (!request || request.receiverId !== userId || request.streakId !== streakId) {
      res.status(404).json({ error: 'Запрос не найден' })
      return
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Запрос уже обработан или истек' })
      return
    }

    const claimed = await prisma.remoteSelfieRequest.updateMany({
      where: {
        id: requestId,
        streakId,
        receiverId: userId,
        status: 'PENDING',
      },
      data: { status: 'COMPLETED' },
    })
    if (claimed.count === 0) {
      res.status(409).json({ error: 'Запрос уже обработан или истек' })
      return
    }

    const streak = await prisma.streak.findUnique({
      where: { id: streakId },
      include: { userA: true, userB: true },
    })

    if (!streak) {
      await prisma.remoteSelfieRequest.update({
        where: { id: requestId },
        data: { status: 'PENDING' },
      })
      res.status(404).json({ error: 'Серия не найдена' })
      return
    }

    async function revertClaim() {
      await prisma.remoteSelfieRequest.update({
        where: { id: requestId },
        data: { status: 'PENDING' },
      })
    }

    // Combine images
    let combinedUrl: string
    try {
      combinedUrl = await combineRemoteSelfieImages(
        request.senderPhotoUrl,
        photoBase64,
        `combined_${Date.now()}_${streakId}`
      )
    } catch (e) {
      console.error('Error combining images', e)
      await revertClaim()
      res.status(500).json({ error: 'Ошибка при объединении фото' })
      return
    }

    let photoHash: string
    try {
      photoHash = await hashImageFile(combinedUrl)
    } catch (e) {
      console.error('Error hashing combined image', e)
      await revertClaim()
      res.status(500).json({ error: 'Ошибка при сохранении фото' })
      return
    }

    // Add MeetProof and extend streak
    const userTimezone = await getUserTimezone(userId)
    const today = getLocalDateString(userTimezone)

    let streakDay = await prisma.streakDay.findUnique({
      where: { streakId_date: { streakId: streak.id, date: today } },
    })

    if (!streakDay) {
      streakDay = await prisma.streakDay.create({
        data: { streakId: streak.id, date: today, status: 'MET' },
      })
    }

    await prisma.meetProof.create({
      data: {
        streakDayId: streakDay.id,
        uploadedById: userId,
        photoUrl: combinedUrl,
        photoHash,
        facesDetected: 2,
      },
    })

    const alreadyMetToday = streak.lastMetDate === today
    if (!alreadyMetToday) {
      await prisma.streak.update({
        where: { id: streak.id },
        data: { count: { increment: 1 }, lastMetDate: today },
      })
      await prisma.user.updateMany({
        where: { id: { in: [streak.userAId, streak.userBId] } },
        data: { gemsBalance: { increment: 1 } },
      })
    }

    const receiver = streak.userAId === userId ? streak.userA : streak.userB
    notifyUser(request.senderId, 'notification', {
      type: 'remote_selfie_completed',
      message: `✨ @${receiver.nickname} ответил(а) на селфи! Серия продлена!`,
      route: `/streaks/${receiver.nickname}`,
    })

    res.json({ success: true, photoUrl: combinedUrl })
  }
)

// GET /api/streaks/:partnerNickname — серия с другом по его @username
router.get('/:partnerNickname', async (req: AuthRequest, res: Response) => {
  const param = String(
    Array.isArray(req.params.partnerNickname)
      ? req.params.partnerNickname[0]
      : req.params.partnerNickname
  )
  const userId = req.userId!
  const { page, limit } = parsePagination(req.query, { limit: 10, maxLimit: 30 })

  const isLegacyId = /^c[a-z0-9]{20,}$/i.test(param)
  const include = streakDetailInclude(page, limit, userId)

  let streakId: string | null = null
  if (isLegacyId) {
    streakId = param
  } else {
    const partner = await prisma.user.findFirst({
      where: { nickname: param.toLowerCase(), deletedAt: null },
      select: { id: true },
    })
    if (!partner) {
      res.status(404).json({ error: 'Streak not found' })
      return
    }
    const meta = await prisma.streak.findFirst({
      where: {
        active: true,
        OR: [
          { userAId: userId, userBId: partner.id },
          { userAId: partner.id, userBId: userId },
        ],
      },
      select: { id: true },
    })
    streakId = meta?.id ?? null
  }

  if (!streakId) {
    res.status(404).json({ error: 'Streak not found' })
    return
  }

  await expireStaleRemoteSelfieRequests(streakId)

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include,
  })

  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    res.status(404).json({ error: 'Streak not found' })
    return
  }

  res.json(streak)
})

function streakDetailInclude(page: number, limit: number, userId: string) {
  const pendingSince = new Date(Date.now() - REMOTE_SELFIE_TTL_MS)
  return {
    userA: { select: { id: true, nickname: true, avatarUrl: true } },
    userB: { select: { id: true, nickname: true, avatarUrl: true } },
    remoteSelfies: {
      where: {
        status: 'PENDING' as const,
        createdAt: { gte: pendingSince },
        OR: [{ receiverId: userId }, { senderId: userId }],
      },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      include: { sender: { select: { id: true, nickname: true } } },
    },
    streakDays: {
      include: {
        meetProofs: {
          include: {
            uploadedBy: { select: { id: true, nickname: true } },
          },
        },
      },
      orderBy: { date: 'desc' as const },
      skip: (page - 1) * limit,
      take: limit,
    },
  }
}

export default router

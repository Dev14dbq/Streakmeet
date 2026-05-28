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
  bestFaceMatchInGallery,
  CURRENT_FACE_MODEL,
  detectFacesFromBase64,
  ensureFaceService,
  FACE_MATCH_THRESHOLD_PARTNER,
  FACE_MATCH_THRESHOLD_SELF,
  isValidEmbedding,
  type FaceQuality,
} from '../lib/face.js'
import { getLocalDateString, normalizeTimezone } from '../lib/timezone.js'
import {
  generousStreakTimezone,
  instantMeetStreakDay,
  remoteSelfieStreakDay,
} from '../lib/streakCalendar.js'
import { expireStaleRemoteSelfieRequests, REMOTE_SELFIE_TTL_MS } from '../lib/remoteSelfie.js'
import { parsePagination } from '../lib/pagination.js'
import { faceErrorFromException, ErrorCodes, sendError } from '../lib/apiErrors.js'

const router = Router()
router.use(requireAuth)

async function getPartnerTimezones(userId: string, partnerId: string) {
  const [self, partner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.user.findUnique({ where: { id: partnerId }, select: { timezone: true } }),
  ])
  return generousStreakTimezone(self?.timezone, partner?.timezone)
}

// GET /api/streaks
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const pendingSince = new Date(Date.now() - REMOTE_SELFIE_TTL_MS)

  const streaks = await prisma.streak.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      active: true,
    },
    include: {
      userA: { select: { id: true, nickname: true, avatarUrl: true } },
      userB: { select: { id: true, nickname: true, avatarUrl: true } },
      remoteSelfies: {
        where: {
          status: 'PENDING',
          createdAt: { gte: pendingSince },
          OR: [{ receiverId: userId }, { senderId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { id: true, nickname: true } } },
      },
    },
  })

  const formatted = streaks.map((s) => {
    const isUserA = s.userAId === userId
    const partner = isUserA ? s.userB : s.userA
    const pending = s.remoteSelfies[0]
    return {
      id: s.id,
      count: s.count,
      lastMetDate: s.lastMetDate,
      timezone: s.timezone,
      partner,
      pendingRemoteSelfie: pending
        ? {
            id: pending.id,
            senderId: pending.senderId,
            receiverId: pending.receiverId,
            senderPhotoUrl: pending.senderPhotoUrl,
            needsReply: pending.receiverId === userId,
            senderNickname: pending.sender.nickname,
          }
        : null,
    }
  })

  res.json(formatted)
})

// POST /api/streaks
router.post('/', async (req: AuthRequest, res: Response) => {
  const { partnerId } = req.body as { partnerId?: string }
  const userId = req.userId!

  if (typeof partnerId !== 'string' || !partnerId.trim()) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }

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
    sendError(res, 400, ErrorCodes.NOT_FRIENDS)
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
    sendError(res, 400, ErrorCodes.STREAK_EXISTS)
    return
  }

  const streak = await prisma.streak.create({
    data: {
      userAId: userId,
      userBId: partnerId,
      count: 0,
      timezone: await getPartnerTimezones(userId, partnerId),
    },
  })

  res.json(streak)
})

// POST /api/streaks/magic-meet
//
// Accepts either a single `photoBase64` (legacy clients) or a `photosBase64`
// burst from the new camera. For each frame we run InsightFace detection,
// then collect ALL detected face embeddings into a pool. Self-match and
// partner-match are then computed against each user's stored gallery using
// max-cosine-similarity — far more robust than the old centroid approach.
const MAGIC_MEET_MAX_FRAMES = 5

interface MagicMeetCandidate {
  frameIndex: number
  faceIndexInFrame: number
  embedding: number[]
  detScore: number
  bboxArea: number
}

router.post('/magic-meet', async (req: AuthRequest, res: Response) => {
  const t0 = Date.now()
  const userId = req.userId!
  const { photoBase64, photosBase64, location } = req.body as {
    photoBase64?: string
    photosBase64?: string[]
    location?: { lat: number; lng: number }
  }

  const photos: string[] = (() => {
    if (Array.isArray(photosBase64) && photosBase64.length > 0) {
      return photosBase64.slice(0, MAGIC_MEET_MAX_FRAMES)
    }
    if (typeof photoBase64 === 'string' && photoBase64.length > 0) return [photoBase64]
    return []
  })()

  console.log(
    `[magic-meet] request from user ${userId}, frames=${photos.length}, total=${photos.reduce((s, p) => s + p.length, 0)}B`
  )

  if (photos.length === 0) {
    console.log('[magic-meet] rejected: no photo')
    sendError(res, 400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
    return
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { faceEmbeddings: true },
  })
  if (!currentUser?.faceEnrolled || currentUser.faceEmbeddings.length === 0) {
    console.log('[magic-meet] rejected: face not enrolled')
    sendError(res, 400, ErrorCodes.FACE_NOT_ENROLLED)
    return
  }

  const myGallery: number[][] = currentUser.faceEmbeddings
    .map((e) => e.vector as unknown)
    .filter(isValidEmbedding) as number[][]

  if (myGallery.length === 0) {
    sendError(res, 400, ErrorCodes.FACE_LEGACY_EMBEDDING)
    return
  }

  let pool: MagicMeetCandidate[]
  try {
    await ensureFaceService()
    pool = await collectFaceCandidates(photos)
  } catch (e) {
    console.error('[magic-meet] face detection failed', e)
    const { code, message } = faceErrorFromException(e)
    sendError(res, 500, code, message)
    return
  }

  if (pool.length < 2) {
    console.log(
      `[magic-meet] rejected: only ${pool.length} face(s) across ${photos.length} frame(s)`
    )
    sendError(
      res,
      400,
      ErrorCodes.MAGIC_MEET_MIN_FACES,
      `На фото должно быть минимум 2 лица (найдено: ${pool.length})`
    )
    return
  }

  const poolEmbeddings = pool.map((c) => c.embedding)
  const selfMatch = bestFaceMatchInGallery(poolEmbeddings, myGallery)
  if (selfMatch.sim < FACE_MATCH_THRESHOLD_SELF) {
    console.log(
      `[magic-meet] rejected: user not on photo (best self-sim=${selfMatch.sim.toFixed(3)})`
    )
    sendError(res, 400, ErrorCodes.MAGIC_MEET_USER_NOT_ON_PHOTO)
    return
  }
  const myFaceCandidateIdx = selfMatch.faceIndex
  const myFrameIndex = pool[myFaceCandidateIdx]!.frameIndex
  console.log(
    `[magic-meet] self matched at frame=${myFrameIndex} sim=${selfMatch.sim.toFixed(3)} pool=${pool.length}`
  )

  // Pick the best frame for saving — the one containing the user's face (highest sum of det_score).
  const bestFrameIdx = pickBestFrame(pool, myFaceCandidateIdx) ?? 0
  const bestPhotoBase64 = photos[bestFrameIdx]!

  const photoHash = await computePhotoHash(bestPhotoBase64).catch(() => null)
  if (!photoHash) {
    sendError(res, 400, ErrorCodes.INVALID_PHOTO)
    return
  }

  const activeStreaks = await prisma.streak.findMany({
    where: { active: true, OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: { include: { faceEmbeddings: true } },
      userB: { include: { faceEmbeddings: true } },
    },
  })

  const extendedStreaks: { nickname: string; avatarUrl: string | null }[] = []
  const addedPhotos: { nickname: string; avatarUrl: string | null }[] = []
  const duplicatePartners: string[] = []
  let savedPhotoUrl: string | null = null

  // Candidates excluding the user's own face — partner search runs against this subset.
  const partnerProbes = poolEmbeddings.filter((_, i) => i !== myFaceCandidateIdx)

  for (const streak of activeStreaks) {
    const partner = streak.userAId === userId ? streak.userB : streak.userA
    if (!partner.faceEnrolled) continue
    const partnerGallery: number[][] = partner.faceEmbeddings
      .map((e) => e.vector as unknown)
      .filter(isValidEmbedding) as number[][]
    if (partnerGallery.length === 0) continue

    const m = bestFaceMatchInGallery(partnerProbes, partnerGallery)
    if (m.sim < FACE_MATCH_THRESHOLD_PARTNER) {
      console.log(
        `[magic-meet] partner @${partner.nickname} not matched (best=${m.sim.toFixed(3)})`
      )
      continue
    }
    console.log(`[magic-meet] partner @${partner.nickname} matched (sim=${m.sim.toFixed(3)})`)

    const today = instantMeetStreakDay(streak.timezone)

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
      savedPhotoUrl = await saveBase64ImageAsAvif(bestPhotoBase64, `${Date.now()}_${userId}`)
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
        facesDetected: pool.length,
        matchScores: {
          self: selfMatch.sim,
          partner: m.sim,
          model: CURRENT_FACE_MODEL,
        },
      },
    })
  }

  const allPartners = [...extendedStreaks, ...addedPhotos]

  if (allPartners.length === 0) {
    if (duplicatePartners.length > 0) {
      console.log(`[magic-meet] rejected: duplicate photo for ${duplicatePartners.join(', ')}`)
      sendError(
        res,
        400,
        ErrorCodes.MAGIC_MEET_DUPLICATE_PHOTO,
        `Это фото уже было добавлено${duplicatePartners.length === 1 ? ` (с @${duplicatePartners[0]})` : ''}`
      )
      return
    }
    console.log(
      `[magic-meet] rejected: no matching friends (${activeStreaks.length} active streaks checked)`
    )
    sendError(res, 400, ErrorCodes.MAGIC_MEET_NO_MATCH)
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

async function collectFaceCandidates(photos: string[]): Promise<MagicMeetCandidate[]> {
  const out: MagicMeetCandidate[] = []
  for (let frameIdx = 0; frameIdx < photos.length; frameIdx++) {
    const photo = photos[frameIdx]!
    const detections: FaceQuality[] = await detectFacesFromBase64(photo)
    for (let i = 0; i < detections.length; i++) {
      const d = detections[i]!
      const [x1, y1, x2, y2] = d.bbox
      out.push({
        frameIndex: frameIdx,
        faceIndexInFrame: i,
        embedding: d.embedding,
        detScore: d.det_score,
        bboxArea: Math.max(0, (x2! - x1!) * (y2! - y1!)),
      })
    }
  }
  return out
}

/** Pick the frame with the highest sum of det_score that contains the user's face. */
function pickBestFrame(pool: MagicMeetCandidate[], userCandidateIdx: number): number | null {
  if (pool.length === 0) return null
  const userFrame = pool[userCandidateIdx]?.frameIndex
  const scoreByFrame = new Map<number, number>()
  for (const c of pool) {
    scoreByFrame.set(c.frameIndex, (scoreByFrame.get(c.frameIndex) ?? 0) + c.detScore)
  }
  if (userFrame !== undefined && scoreByFrame.has(userFrame)) return userFrame
  let bestFrame = pool[0]!.frameIndex
  let bestScore = -Infinity
  for (const [f, s] of scoreByFrame) {
    if (s > bestScore) {
      bestScore = s
      bestFrame = f
    }
  }
  return bestFrame
}

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
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
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
    sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
    return
  }

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { nickname: true, timezone: true },
  })
  if (!sender) {
    sendError(res, 404, ErrorCodes.USER_NOT_FOUND)
    return
  }

  const today = getLocalDateString(normalizeTimezone(streak.timezone))
  if (streak.lastMetDate === today) {
    sendError(res, 400, ErrorCodes.STREAK_ALREADY_MET_TODAY)
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
    sendError(res, 400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
    return
  }

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include: { userA: true, userB: true },
  })

  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
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
    sendError(res, 409, ErrorCodes.REMOTE_SELFIE_PENDING)
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
      sendError(res, 400, ErrorCodes.MAGIC_MEET_PHOTO_REQUIRED)
      return
    }

    const request = await prisma.remoteSelfieRequest.findUnique({
      where: { id: requestId },
      include: { sender: true },
    })

    if (!request || request.receiverId !== userId || request.streakId !== streakId) {
      sendError(res, 404, ErrorCodes.REMOTE_SELFIE_NOT_FOUND)
      return
    }

    if (request.status !== 'PENDING') {
      sendError(res, 400, ErrorCodes.REMOTE_SELFIE_HANDLED)
      return
    }

    const ageMs = Date.now() - request.createdAt.getTime()
    if (ageMs > REMOTE_SELFIE_TTL_MS) {
      await prisma.remoteSelfieRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      })
      sendError(res, 410, ErrorCodes.REMOTE_SELFIE_EXPIRED)
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
      sendError(res, 409, ErrorCodes.REMOTE_SELFIE_HANDLED)
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
      sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
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
      sendError(res, 500, ErrorCodes.IMAGE_COMBINE_FAILED)
      return
    }

    let photoHash: string
    try {
      photoHash = await hashImageFile(combinedUrl)
    } catch (e) {
      console.error('Error hashing combined image', e)
      await revertClaim()
      sendError(res, 500, ErrorCodes.IMAGE_SAVE_FAILED)
      return
    }

    // Add MeetProof and extend streak (day anchored to when remote selfie was initiated)
    const today = remoteSelfieStreakDay(streak.timezone, request.createdAt)

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
    const notifyMessage = alreadyMetToday
      ? `✨ @${receiver.nickname} ответил(а) на селфи! Добавлено новое фото.`
      : `✨ @${receiver.nickname} ответил(а) на селфи! Серия продлена!`
    notifyUser(request.senderId, 'notification', {
      type: 'remote_selfie_completed',
      message: notifyMessage,
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
      sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
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
    sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
    return
  }

  await expireStaleRemoteSelfieRequests(streakId)

  const streak = await prisma.streak.findUnique({
    where: { id: streakId },
    include,
  })

  if (!streak || (streak.userAId !== userId && streak.userBId !== userId)) {
    sendError(res, 404, ErrorCodes.STREAK_NOT_FOUND)
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

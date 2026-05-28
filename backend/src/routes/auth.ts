import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import appleSignin from 'apple-signin-auth'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../lib/prisma.js'
import {
  CURRENT_FACE_MODEL,
  embedBurstFromBase64,
  ensureFaceService,
  passesEnrollQuality,
} from '../lib/face.js'
import { faceErrorFromException, ErrorCodes, sendError } from '../lib/apiErrors.js'
import {
  deletedAccountPayload,
  findActiveUserByNickname,
  findUserByEmail,
  isRetentionExpired,
  purgeUser,
} from '../lib/accountDeletion.js'
import { isValidTimezone, normalizeTimezone } from '../lib/timezone.js'
import { acceptCurrentLegalForUser } from '../lib/legalDocuments.js'
import { getJwtSecret } from '../lib/jwtSecret.js'
import type { AuthResponse, AuthUser } from '../types/api.js'

import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

async function resolveGoogleProfile(body: {
  accessToken?: string
  idToken?: string
}): Promise<{ email: string; name?: string }> {
  const { accessToken, idToken } = body
  if (!accessToken && !idToken) {
    throw new Error('token_required')
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('not_configured')
  }

  if (idToken) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) throw new Error('no_email')
    return { email: payload.email, name: payload.name }
  }

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!infoRes.ok) throw new Error('invalid_access_token')
  const info = (await infoRes.json()) as { email?: string; name?: string }
  if (!info.email) throw new Error('no_email')
  return { email: info.email, name: info.name }
}

// POST /api/auth/enroll-face
//
// Accepts a burst of frames captured during the enrollment flow (different
// poses / expressions). Each frame is independently embedded by the Python
// face-service; quality-poor frames are rejected. We keep ALL accepted
// embeddings as a gallery — matching later uses max-cosine over the gallery,
// which is dramatically more robust to pose than a single averaged centroid.
const MIN_INPUT_FRAMES = 3
const MAX_INPUT_FRAMES = 16
const MIN_ACCEPTED_EMBEDDINGS = 4

router.post('/enroll-face', requireAuth, async (req: AuthRequest, res: Response) => {
  const { photos } = req.body as { photos?: string[] }
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    sendError(res, 400, ErrorCodes.PHOTOS_REQUIRED)
    return
  }
  if (photos.length < MIN_INPUT_FRAMES || photos.length > MAX_INPUT_FRAMES) {
    sendError(res, 400, ErrorCodes.FACE_ENROLL_TOO_FEW_FRAMES)
    return
  }
  for (const photo of photos) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
      sendError(res, 400, ErrorCodes.INVALID_PHOTO)
      return
    }
  }

  try {
    await ensureFaceService()
    const results = await embedBurstFromBase64(photos)

    const accepted: {
      vector: number[]
      detScore: number
      yaw: number
      pitch: number
      blurVar: number
    }[] = []
    const reasons: Record<string, number> = {}

    for (const r of results) {
      if (!r.face) {
        const k = r.error ?? 'no_face'
        reasons[k] = (reasons[k] ?? 0) + 1
        continue
      }
      const q = passesEnrollQuality(r.face)
      if (!q.ok) {
        reasons[q.reason ?? 'low_quality'] = (reasons[q.reason ?? 'low_quality'] ?? 0) + 1
        continue
      }
      accepted.push({
        vector: r.face.embedding,
        detScore: r.face.det_score,
        yaw: r.face.yaw,
        pitch: r.face.pitch,
        blurVar: r.face.blur_var,
      })
    }

    console.log(
      `[enroll-face] user=${req.userId} frames=${photos.length} accepted=${accepted.length} reasons=${JSON.stringify(reasons)}`
    )

    if (accepted.length < MIN_ACCEPTED_EMBEDDINGS) {
      sendError(res, 400, ErrorCodes.FACE_ENROLL_LOW_QUALITY, undefined, {
        accepted: accepted.length,
        needed: MIN_ACCEPTED_EMBEDDINGS,
        reasons,
      })
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.faceEmbedding.deleteMany({ where: { userId: req.userId! } })
      await tx.faceEmbedding.createMany({
        data: accepted.map((a) => ({
          userId: req.userId!,
          vector: a.vector,
          detScore: a.detScore,
          yaw: a.yaw,
          pitch: a.pitch,
          blurVar: a.blurVar,
          faceModel: CURRENT_FACE_MODEL,
          source: 'enrollment',
        })),
      })
      await tx.user.update({
        where: { id: req.userId! },
        data: {
          faceEnrolled: true,
          faceModel: CURRENT_FACE_MODEL,
          faceEnrolledAt: new Date(),
        },
      })
    })

    res.json({ success: true, accepted: accepted.length, total: photos.length })
  } catch (e) {
    console.error('[enroll-face]', e)
    const { code, message } = faceErrorFromException(e)
    sendError(res, 500, code, message)
  }
})

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

function makeTokens(userId: string): Pick<AuthResponse, 'accessToken'> {
  const accessToken = jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
  return { accessToken }
}

function authUserPayload(user: {
  id: string
  email: string
  nickname: string
  faceEnrolled: boolean
  isPublic: boolean
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    faceEnrolled: user.faceEnrolled,
    isPublic: user.isPublic,
  }
}

async function syncUserTimezone(userId: string, timezone?: string) {
  if (!timezone || !isValidTimezone(timezone)) return
  await prisma.user.update({
    where: { id: userId },
    data: { timezone },
  })
}

function safeNickname(email: string) {
  return email
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 20)
}

async function resolveDeletedAccount(
  user: { id: string; email: string; deletedAt: Date | null },
  res: Response
) {
  if (!user.deletedAt) return false

  if (isRetentionExpired(user.deletedAt)) {
    await purgeUser(user.id)
    sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
    return true
  }

  res.status(403).json(deletedAccountPayload({ email: user.email, deletedAt: user.deletedAt }))
  return true
}

async function findOrCreateOAuthUser(data: {
  email: string
  provider: 'google' | 'apple'
  displayName?: string
  timezone?: string
}) {
  let user = await findUserByEmail(data.email)

  if (user?.deletedAt) {
    return user
  }

  const timezone = data.timezone && isValidTimezone(data.timezone) ? data.timezone : undefined

  if (!user) {
    let base = safeNickname(data.email)
    let nick = base
    let attempt = 0
    while (await findActiveUserByNickname(nick)) {
      attempt++
      nick = `${base}${attempt}`
    }

    user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: '',
        nickname: nick,
        ...(timezone ? { timezone } : {}),
      },
    })
    await acceptCurrentLegalForUser(user.id)
  } else if (timezone) {
    await syncUserTimezone(user.id, timezone)
  }

  return user
}

async function restoreDeletedUser(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
  })
}

// ─── Email flow ────────────────────────────────────────────────────────────────

// POST /api/auth/check-email
router.post('/check-email', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string }
  if (!email || !email.includes('@')) {
    sendError(res, 400, ErrorCodes.INVALID_EMAIL)
    return
  }
  const user = await findUserByEmail(email)
  res.json({ exists: !!user })
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password, timezone } = req.body as {
    email?: string
    password?: string
    timezone?: string
  }
  if (!email || !password) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  const user = await findUserByEmail(email)
  if (!user || !user.passwordHash) {
    sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
    return
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
    return
  }
  if (await resolveDeletedAccount(user, res)) return

  await syncUserTimezone(user.id, timezone)

  res.json({
    ...makeTokens(user.id),
    user: authUserPayload(user),
  })
})

// POST /api/auth/restore-account
router.post('/restore-account', async (req: Request, res: Response) => {
  const { email, password, provider, accessToken, idToken } = req.body as {
    email?: string
    password?: string
    provider?: 'google' | 'apple'
    accessToken?: string
    idToken?: string
  }

  try {
    let userEmail: string | undefined

    if (provider === 'google') {
      if (!accessToken && !idToken) {
        sendError(res, 400, ErrorCodes.MISSING_FIELD)
        return
      }
      const profile = await resolveGoogleProfile({ accessToken, idToken })
      userEmail = profile.email
    } else if (provider === 'apple') {
      if (!idToken) {
        sendError(res, 400, ErrorCodes.MISSING_FIELD)
        return
      }
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      })
      userEmail = payload.email
    } else {
      if (!email || !password) {
        sendError(res, 400, ErrorCodes.MISSING_FIELD)
        return
      }
      const user = await findUserByEmail(email)
      if (!user || !user.passwordHash) {
        sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
        return
      }
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
        return
      }
      if (!user.deletedAt) {
        res.json({ ...makeTokens(user.id), user: authUserPayload(user) })
        return
      }
      if (isRetentionExpired(user.deletedAt)) {
        await purgeUser(user.id)
        sendError(res, 410, ErrorCodes.ACCOUNT_RETENTION_EXPIRED)
        return
      }
      const restored = await restoreDeletedUser(user.id)
      res.json({ ...makeTokens(restored.id), user: authUserPayload(restored) })
      return
    }

    if (!userEmail) {
      sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
      return
    }

    const user = await findUserByEmail(userEmail)
    if (!user) {
      sendError(res, 401, ErrorCodes.INVALID_CREDENTIALS)
      return
    }
    if (!user.deletedAt) {
      res.json({ ...makeTokens(user.id), user: authUserPayload(user) })
      return
    }
    if (isRetentionExpired(user.deletedAt)) {
      await purgeUser(user.id)
      sendError(res, 410, ErrorCodes.ACCOUNT_RETENTION_EXPIRED)
      return
    }

    const restored = await restoreDeletedUser(user.id)
    res.json({ ...makeTokens(restored.id), user: authUserPayload(restored) })
  } catch {
    sendError(res, 401, ErrorCodes.RESTORE_ACCOUNT_FAILED)
  }
})

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, nickname, username, timezone } = req.body as {
    email?: string
    password?: string
    nickname?: string
    username?: string
    timezone?: string
  }
  if (!email || !password || !username) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  if (password.length < 6) {
    sendError(res, 400, ErrorCodes.PASSWORD_TOO_SHORT)
    return
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    sendError(res, 400, ErrorCodes.INVALID_USERNAME)
    return
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedUsername = username.toLowerCase()

  const existingEmail = await findUserByEmail(normalizedEmail)
  if (existingEmail) {
    if (existingEmail.deletedAt) {
      if (isRetentionExpired(existingEmail.deletedAt)) {
        await purgeUser(existingEmail.id)
      } else {
        sendError(res, 409, ErrorCodes.ACCOUNT_DELETED)
        return
      }
    } else {
      sendError(res, 409, ErrorCodes.EMAIL_ALREADY_IN_USE)
      return
    }
  }

  const existingNickname = await findActiveUserByNickname(normalizedUsername)
  if (existingNickname) {
    sendError(res, 409, ErrorCodes.USERNAME_TAKEN)
    return
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      nickname: normalizedUsername,
      timezone: normalizeTimezone(timezone),
    },
  })
  await acceptCurrentLegalForUser(user.id)
  res.status(201).json({
    ...makeTokens(user.id),
    user: authUserPayload(user),
  })
})

// ─── Google OAuth ─────────────────────────────────────────────────────────────

// POST /api/auth/google  { accessToken?, idToken? }
router.post('/google', async (req: Request, res: Response) => {
  const { accessToken, idToken, timezone } = req.body as {
    accessToken?: string
    idToken?: string
    timezone?: string
  }
  if (!accessToken && !idToken) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    sendError(res, 503, ErrorCodes.OAUTH_NOT_CONFIGURED)
    return
  }
  try {
    const info = await resolveGoogleProfile({ accessToken, idToken })

    const user = await findOrCreateOAuthUser({
      email: info.email,
      provider: 'google',
      displayName: info.name,
      timezone,
    })

    if (await resolveDeletedAccount(user, res)) return

    res.json({
      ...makeTokens(user.id),
      user: authUserPayload(user),
    })
  } catch {
    sendError(res, 401, ErrorCodes.OAUTH_INVALID_TOKEN)
  }
})

// ─── Apple Sign In ────────────────────────────────────────────────────────────

// POST /api/auth/apple  { idToken, user? }
router.post('/apple', async (req: Request, res: Response) => {
  const { idToken, timezone } = req.body as { idToken?: string; timezone?: string }
  if (!idToken) {
    sendError(res, 400, ErrorCodes.MISSING_FIELD)
    return
  }
  if (!process.env.APPLE_CLIENT_ID) {
    sendError(res, 503, ErrorCodes.OAUTH_NOT_CONFIGURED)
    return
  }
  try {
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    })
    if (!payload.email) throw new Error('No email in token')

    const user = await findOrCreateOAuthUser({ email: payload.email, provider: 'apple', timezone })
    if (await resolveDeletedAccount(user, res)) return

    res.json({
      ...makeTokens(user.id),
      user: authUserPayload(user),
    })
  } catch {
    sendError(res, 401, ErrorCodes.OAUTH_INVALID_TOKEN)
  }
})

export default router

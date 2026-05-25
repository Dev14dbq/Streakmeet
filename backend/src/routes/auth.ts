import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import appleSignin from 'apple-signin-auth'
import { prisma } from '../lib/prisma.js'
import { averageEmbeddings, embedFaceFromBase64, ensureFaceService } from '../lib/face.js'
import {
  deletedAccountPayload,
  findActiveUserByNickname,
  findUserByEmail,
  isRetentionExpired,
  purgeUser,
} from '../lib/accountDeletion.js'
import { isValidTimezone, normalizeTimezone } from '../lib/timezone.js'

import { requireAuth, type AuthRequest } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/enroll-face
router.post('/enroll-face', requireAuth, async (req: AuthRequest, res: Response) => {
  const { photos } = req.body as { photos?: string[] }
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    res.status(400).json({ error: 'Нужно хотя бы одно фото' })
    return
  }

  try {
    await ensureFaceService()
    const embeddings: number[][] = []

    for (const photo of photos) {
      if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
        res.status(400).json({ error: 'Некорректный формат фото' })
        return
      }
      const face = await embedFaceFromBase64(photo)
      embeddings.push(face.embedding)
    }

    const embedding = averageEmbeddings(embeddings)

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        faceEnrolled: true,
        faceEmbedding: embedding,
      },
    })

    res.json({ success: true })
  } catch (e) {
    console.error('[enroll-face]', e)
    const msg = e instanceof Error ? e.message : 'Ошибка обработки лица на сервере'
    res.status(500).json({ error: msg })
  }
})

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

function makeTokens(userId: string) {
  const accessToken = jwt.sign({ sub: userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
  return { accessToken }
}

function authUserPayload(user: {
  id: string
  email: string
  nickname: string
  faceEnrolled: boolean
}) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    faceEnrolled: user.faceEnrolled,
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
    res.status(401).json({ error: 'Invalid credentials' })
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
    res.status(400).json({ error: 'Invalid email' })
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
    res.status(400).json({ error: 'Email and password are required' })
    return
  }
  const user = await findUserByEmail(email)
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
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
      if (!accessToken) {
        res.status(400).json({ error: 'accessToken is required' })
        return
      }
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!infoRes.ok) throw new Error('Failed to get Google userinfo')
      const info = (await infoRes.json()) as { email?: string }
      userEmail = info.email
    } else if (provider === 'apple') {
      if (!idToken) {
        res.status(400).json({ error: 'idToken is required' })
        return
      }
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      })
      userEmail = payload.email
    } else {
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' })
        return
      }
      const user = await findUserByEmail(email)
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }
      if (!user.deletedAt) {
        res.json({ ...makeTokens(user.id), user: authUserPayload(user) })
        return
      }
      if (isRetentionExpired(user.deletedAt)) {
        await purgeUser(user.id)
        res.status(410).json({ error: 'Срок восстановления истёк — аккаунт удалён навсегда' })
        return
      }
      const restored = await restoreDeletedUser(user.id)
      res.json({ ...makeTokens(restored.id), user: authUserPayload(restored) })
      return
    }

    if (!userEmail) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const user = await findUserByEmail(userEmail)
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (!user.deletedAt) {
      res.json({ ...makeTokens(user.id), user: authUserPayload(user) })
      return
    }
    if (isRetentionExpired(user.deletedAt)) {
      await purgeUser(user.id)
      res.status(410).json({ error: 'Срок восстановления истёк — аккаунт удалён навсегда' })
      return
    }

    const restored = await restoreDeletedUser(user.id)
    res.json({ ...makeTokens(restored.id), user: authUserPayload(restored) })
  } catch {
    res.status(401).json({ error: 'Не удалось восстановить аккаунт' })
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
  if (!email || !password || !nickname || !username) {
    res.status(400).json({ error: 'All fields are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 chars: a-z, 0-9, _' })
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
        res.status(409).json({
          error: 'Аккаунт удалён — войдите, чтобы восстановить',
          code: 'ACCOUNT_DELETED',
        })
        return
      }
    } else {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
  }

  const existingNickname = await findActiveUserByNickname(normalizedUsername)
  if (existingNickname) {
    res.status(409).json({ error: 'Username already taken' })
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
  res.status(201).json({
    ...makeTokens(user.id),
    user: authUserPayload(user),
  })
})

// ─── Google OAuth ─────────────────────────────────────────────────────────────

// POST /api/auth/google  { accessToken }
router.post('/google', async (req: Request, res: Response) => {
  const { accessToken, timezone } = req.body as { accessToken?: string; timezone?: string }
  if (!accessToken) {
    res.status(400).json({ error: 'accessToken is required' })
    return
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server' })
    return
  }
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!infoRes.ok) throw new Error('Failed to get Google userinfo')
    const info = (await infoRes.json()) as { email?: string; name?: string }
    if (!info.email) throw new Error('No email in Google profile')

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
    res.status(401).json({ error: 'Invalid Google token' })
  }
})

// ─── Apple Sign In ────────────────────────────────────────────────────────────

// POST /api/auth/apple  { idToken, user? }
router.post('/apple', async (req: Request, res: Response) => {
  const { idToken, timezone } = req.body as { idToken?: string; timezone?: string }
  if (!idToken) {
    res.status(400).json({ error: 'idToken is required' })
    return
  }
  if (!process.env.APPLE_CLIENT_ID) {
    res.status(503).json({ error: 'Apple Sign In is not configured on this server' })
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
    res.status(401).json({ error: 'Invalid Apple token' })
  }
})

export default router

import { Router } from 'express'
import { ErrorCodes, sendError, asyncHandler } from '../common/errors.js'
import { authRateLimit, sensitiveAuthRateLimit, mediaRateLimit } from './middleware.js'
import { requireEmailVerified } from './middleware.js'
import { requireAuth, type AuthRequest } from './middleware.js'
import { checkEmail, login, register } from './credentials.js'
import { googleLogin, appleLogin, restoreAccount } from './oauth.js'
import {
  enrollFace,
  verifyEmailWithToken,
  verifyEmailAndGetRedirect,
  resendVerification,
  forgotPassword,
  resetPassword,
} from './verification.js'

const router = Router()

router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.body as { token?: string }
    if (!token || typeof token !== 'string') {
      sendError(res, 400, ErrorCodes.MISSING_FIELD)
      return
    }
    await verifyEmailWithToken(token)
    res.json({ success: true })
  })
)

router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    const redirect = await verifyEmailAndGetRedirect(token)
    res.redirect(302, redirect)
  })
)

router.use(authRateLimit)

router.post(
  '/enroll-face',
  mediaRateLimit,
  requireAuth,
  requireEmailVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const { photos } = req.body as { photos?: string[] }
    const result = await enrollFace(req.userId!, photos)
    res.json(result)
  })
)

router.post(
  '/check-email',
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email?: string }
    res.json(await checkEmail(email ?? ''))
  })
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, timezone } = req.body as {
      email?: string
      password?: string
      timezone?: string
    }
    res.json(await login({ email, password, timezone }))
  })
)

router.post(
  '/restore-account',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      email?: string
      password?: string
      provider?: 'google' | 'apple'
      accessToken?: string
      idToken?: string
    }
    res.json(await restoreAccount(body))
  })
)

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      email?: string
      password?: string
      nickname?: string
      username?: string
      timezone?: string
    }
    res.status(201).json(await register(body))
  })
)

router.post(
  '/google',
  asyncHandler(async (req, res) => {
    const { accessToken, idToken, timezone } = req.body as {
      accessToken?: string
      idToken?: string
      timezone?: string
    }
    res.json(await googleLogin({ accessToken, idToken, timezone }))
  })
)

router.post(
  '/apple',
  asyncHandler(async (req, res) => {
    const { idToken, timezone } = req.body as { idToken?: string; timezone?: string }
    res.json(await appleLogin({ idToken, timezone }))
  })
)

router.post(
  '/resend-verification',
  sensitiveAuthRateLimit,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await resendVerification(req.userId!))
  })
)

router.post(
  '/forgot-password',
  sensitiveAuthRateLimit,
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email?: string }
    res.json(await forgotPassword(email))
  })
)

router.post(
  '/reset-password',
  sensitiveAuthRateLimit,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string }
    res.json(await resetPassword({ token, password }))
  })
)

export default router

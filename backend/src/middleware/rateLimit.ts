import rateLimit from 'express-rate-limit'

export const authRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов', code: 'RATE_LIMITED' },
})

export const sensitiveAuthRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов', code: 'RATE_LIMITED' },
})

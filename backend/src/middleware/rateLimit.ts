import rateLimit from 'express-rate-limit'

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов', code: 'RATE_LIMITED' },
  validate: { xForwardedForHeader: false },
}

export const authRateLimit = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 10,
})

export const sensitiveAuthRateLimit = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60_000,
  max: 10,
})

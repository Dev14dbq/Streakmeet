import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import authRouter from './auth/route.js'
import usersRouter from './users/route.js'
import friendsRouter from './friends/route.js'
import streaksRouter from './streaks/route.js'
import locationRouter from './location/route.js'
import publicRouter from './users/public.js'
import legalRouter from './legal/route.js'
import mediaRouter from './media/route.js'
import memoriesRouter from './memories/route.js'
import { errorHandler } from './common/errors.js'
import { initSocket } from './notifications/socket.js'
import { start as startScheduler } from './jobs/scheduler.js'

dotenv.config()

if (process.env.MEMORIES_DEV_MODE === 'true') {
  console.warn('[memories] DEV MODE enabled — GET /api/memories returns placeholder data')
}

const app = express()
const httpServer = createServer(app)
const port = process.env.PORT ?? 3000

app.set('trust proxy', 1)

initSocket(httpServer)

app.use(helmet({ crossOriginResourcePolicy: false }))
const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? []
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : {}))
app.use(express.json({ limit: '1mb' }))

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много запросов', code: 'RATE_LIMITED' },
    validate: { xForwardedForHeader: false },
  })
)

app.use('/uploads', mediaRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'StreakMeet API is running' })
})

app.use('/api/auth', authRouter)
app.use('/api/public', publicRouter)
app.use('/api/users', usersRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/streaks', streaksRouter)
app.use('/api/location', locationRouter)
app.use('/api/legal', legalRouter)
app.use('/api/memories', memoriesRouter)

app.use(errorHandler)

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`)
  startScheduler()
})

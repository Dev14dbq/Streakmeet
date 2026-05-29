import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import friendsRouter from './routes/friends.js'
import streaksRouter from './routes/streaks.js'
import locationRouter from './routes/location.js'
import publicRouter from './routes/public.js'
import legalRouter from './routes/legal.js'
import mediaRouter from './routes/media.js'
import memoriesRouter from './routes/memories.js'
import { errorHandler } from './lib/httpErrors.js'
import { initSocket } from './lib/socket.js'
import { start as startScheduler } from './jobs/scheduler.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const port = process.env.PORT ?? 3000

// nginx проксирует API — нужно для rate-limit и req.ip
app.set('trust proxy', 1)

initSocket(httpServer)

app.use(helmet({ crossOriginResourcePolicy: false })) // Разрешаем загрузку картинок
app.use(cors())
app.use(express.json({ limit: '50mb' }))

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

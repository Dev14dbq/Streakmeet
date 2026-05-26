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
import { errorHandler } from './lib/httpErrors.js'
import { initSocket } from './lib/socket.js'
import { UPLOADS_DIR } from './lib/paths.js'
import { ensureFaceService } from './lib/face.js'
import { ensureLegalDocuments } from './lib/legalDocuments.js'
import { purgeExpiredDeletedUsers } from './lib/accountDeletion.js'
import { processStreakNotifications } from './lib/streakNotifications.js'
import { reconcileAllStreakTimezones } from './lib/streakCalendar.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const port = process.env.PORT ?? 3000

initSocket(httpServer)

app.use(helmet({ crossOriginResourcePolicy: false })) // Разрешаем загрузку картинок
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Раздаем папку uploads статически
app.use('/uploads', express.static(UPLOADS_DIR))

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

app.use(errorHandler)

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`)
  void ensureLegalDocuments().catch((e) =>
    console.error('[legal] Failed to seed legal documents:', e)
  )
  ensureFaceService()
    .then(() => console.log('[face] InsightFace service connected'))
    .catch((e) =>
      console.error('[face] InsightFace service unavailable:', e instanceof Error ? e.message : e)
    )

  void purgeExpiredDeletedUsers().then((count) => {
    if (count > 0) console.log(`[accounts] Purged ${count} expired deleted account(s)`)
  })

  void reconcileAllStreakTimezones().then((count) => {
    if (count > 0) console.log(`[streaks] Reconciled timezone for ${count} streak(s)`)
  })

  const DAY_MS = 86_400_000
  setInterval(() => {
    void purgeExpiredDeletedUsers().then((count) => {
      if (count > 0) console.log(`[accounts] Purged ${count} expired deleted account(s)`)
    })
  }, DAY_MS)

  const STREAK_NOTIFY_MS = 5 * 60_000
  void processStreakNotifications().then((n) => {
    if (n > 0) console.log(`[streak-notify] Sent ${n} notification(s)`)
  })
  setInterval(() => {
    void processStreakNotifications().then((n) => {
      if (n > 0) console.log(`[streak-notify] Sent ${n} notification(s)`)
    })
  }, STREAK_NOTIFY_MS)
})

import { purgeExpiredDeletedUsers } from '../common/account.js'
import { processStreakNotifications } from './streakNotifications.js'
import { reconcileStreakTimezones } from '../streaks/calendar.js'
import { ensureFaceService } from '../face/service.js'
import { ensureLegalDocuments } from '../legal/documents.js'
import { ensureBucket } from '../storage/media.js'

const DAY_MS = 86_400_000
const STREAK_NOTIFY_MS = 5 * 60_000

let purgeInterval: ReturnType<typeof setInterval> | undefined
let streakNotifyInterval: ReturnType<typeof setInterval> | undefined

export function start(): void {
  console.log(
    `[email] Resend ${process.env.RESEND_API_KEY ? 'enabled' : 'DISABLED'}, from=${process.env.RESEND_FROM_EMAIL ?? '(default)'}`
  )

  void ensureBucket().catch((e) => console.error('[s3] MinIO bucket check failed:', e))
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

  void reconcileStreakTimezones().then((count) => {
    if (count > 0) console.log(`[streaks] Reconciled timezone for ${count} streak(s)`)
  })

  purgeInterval = setInterval(() => {
    void purgeExpiredDeletedUsers().then((count) => {
      if (count > 0) console.log(`[accounts] Purged ${count} expired deleted account(s)`)
    })
  }, DAY_MS)

  void processStreakNotifications().then((n) => {
    if (n > 0) console.log(`[streak-notify] Sent ${n} notification(s)`)
  })

  streakNotifyInterval = setInterval(() => {
    void processStreakNotifications().then((n) => {
      if (n > 0) console.log(`[streak-notify] Sent ${n} notification(s)`)
    })
  }, STREAK_NOTIFY_MS)
}

export function stop(): void {
  if (purgeInterval) clearInterval(purgeInterval)
  if (streakNotifyInterval) clearInterval(streakNotifyInterval)
  purgeInterval = undefined
  streakNotifyInterval = undefined
}

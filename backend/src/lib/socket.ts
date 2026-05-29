import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import { verifyAuthToken } from './authToken.js'

let io: Server

const userSockets = new Map<string, string>()

export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: '*' } })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication error'))
    const result = await verifyAuthToken(token)
    if (!result.ok) return next(new Error('Authentication error'))
    socket.data.userId = result.userId
    next()
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    userSockets.set(userId, socket.id)

    socket.on('disconnect', () => {
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId)
      }
    })
  })
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'meet_extended'
  | 'meet_photo_added'
  | 'streak_remind'
  | 'streak_1h'
  | 'streak_30m'
  | 'streak_burned'
  | 'remote_selfie_request'
  | 'remote_selfie_completed'

/** Realtime push payload; aligns with frontend AppNotificationPayload */
export interface NotificationPayload {
  message?: string
  route: string
  type?: NotificationType
  params?: Record<string, string>
}

export function notifyUser(userId: string, event: 'notification', data: NotificationPayload): void
export function notifyUser(userId: string, event: string, data: unknown): void
export function notifyUser(userId: string, event: string, data: unknown) {
  const socketId = userSockets.get(userId)
  if (socketId && io) {
    io.to(socketId).emit(event, data)
  }
}

export function broadcastToUsers(userIds: string[], event: string, data: unknown) {
  if (!io) return
  for (const userId of userIds) {
    const socketId = userSockets.get(userId)
    if (socketId) {
      io.to(socketId).emit(event, data)
    }
  }
}

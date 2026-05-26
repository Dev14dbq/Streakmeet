import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'
import { getJwtSecret } from './jwtSecret.js'

let io: Server

const userSockets = new Map<string, string>()

export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: '*' } })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication error'))
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub: string }
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { deletedAt: true },
      })
      if (!user || user.deletedAt) return next(new Error('Authentication error'))
      socket.data.userId = payload.sub
      next()
    } catch {
      next(new Error('Authentication error'))
    }
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

export function notifyUser(userId: string, event: string, data: any) {
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

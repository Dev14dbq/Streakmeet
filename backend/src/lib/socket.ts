import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'

let io: Server

const userSockets = new Map<string, string>()

export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: '*' } })

  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) return next(new Error('Authentication error'))
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret') as { sub: string }
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

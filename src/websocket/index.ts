import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'
import { supabaseAuth } from '../config/supabase.js'
import * as storeRepository from '../modules/stores/repositories/store.repository.js'
import { SOCKET_EVENTS } from './events.js'

let io: Server | null = null

function storeRoom(storeId: string): string {
  return `store:${storeId}`
}

async function authenticateSocket(socket: Socket): Promise<{ userId: string } | null> {
  const token =
    (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
    (typeof socket.handshake.query?.token === 'string' && socket.handshake.query.token) ||
    null

  if (!token) return null

  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data.user) return null

  return { userId: data.user.id }
}

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',').map((v) => v.trim()) ?? true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  })

  io.on('connection', (socket) => {
    void (async () => {
      const auth = await authenticateSocket(socket)
      if (!auth) {
        socket.emit('error', { message: 'Unauthorized' })
        socket.disconnect(true)
        return
      }

      socket.data.userId = auth.userId

      socket.on(SOCKET_EVENTS.JOIN_STORE, async (payload: { storeId?: string }) => {
        try {
          const storeId = payload?.storeId?.trim()
          if (!storeId) return

          await storeRepository.assertStoreOwner(storeId, auth.userId)
          await socket.join(storeRoom(storeId))
          socket.data.storeId = storeId
        } catch {
          socket.emit('error', { message: 'Forbidden store access' })
        }
      })
    })()
  })

  return io
}

export function getSocketServer(): Server | null {
  return io
}

export function emitToStore<T>(storeId: string, event: string, payload: T): void {
  if (!io) return
  io.to(storeRoom(storeId)).emit(event, payload)
}

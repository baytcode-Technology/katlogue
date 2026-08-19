import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'
import { supabaseAuth } from '../config/supabase.js'
import * as storeRepository from '../modules/stores/repositories/store.repository.js'
import { SOCKET_EVENTS } from './events.js'

let io: Server | null = null

function storeRoom(storeId: number): string {
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

      socket.on(SOCKET_EVENTS.JOIN_STORE, async (payload: { storeId?: number | string }) => {
        try {
          const raw = payload?.storeId
          const storeId = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
          if (!Number.isFinite(storeId) || storeId <= 0) {
            console.log('[websocket] JOIN_STORE invalid storeId:', raw)
            return
          }

          await storeRepository.assertStoreMember(storeId, auth.userId)
          await socket.join(storeRoom(storeId))
          socket.data.storeId = storeId
          console.log('[websocket] client joined store room:', storeId, 'room:', storeRoom(storeId))
        } catch (err) {
          console.error('[websocket] JOIN_STORE failed:', err)
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

export function emitToStore<T>(storeId: number, event: string, payload: T): void {
  if (!io) {
    console.log('[websocket] emitToStore: io not initialized')
    return
  }
  const room = storeRoom(storeId)
  const socketsInRoom = io.sockets.adapter.rooms.get(room)
  console.log('[websocket] emitToStore:', event, 'to room:', room, 'sockets:', socketsInRoom?.size ?? 0)
  io.to(room).emit(event, payload)
}

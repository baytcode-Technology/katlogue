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

function parseStoreId(raw: unknown): number | null {
  const storeId = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isFinite(storeId) || storeId <= 0) return null
  return storeId
}

async function joinStoreRoomForSocket(
  socket: Socket,
  userId: string,
  storeId: number
): Promise<void> {
  await storeRepository.assertStoreMember(storeId, userId)
  await socket.join(storeRoom(storeId))
  socket.data.storeId = storeId
  console.log('[websocket] client joined store room:', storeId, 'room:', storeRoom(storeId))
  socket.emit(SOCKET_EVENTS.STORE_JOINED, { storeId })
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
    console.log('[websocket] new connection, socket.id:', socket.id)

    const authPromise = authenticateSocket(socket).then((auth) => {
      if (!auth) {
        throw new Error('Unauthorized')
      }
      socket.data.userId = auth.userId
      console.log('[websocket] auth success, userId:', auth.userId, 'socket.id:', socket.id)
      return auth
    })

    // Register immediately so early client join emits are not dropped while auth runs.
    socket.on(SOCKET_EVENTS.JOIN_STORE, (payload: { storeId?: number | string }) => {
      console.log('[websocket] JOIN_STORE event received from socket:', socket.id, 'payload:', payload)
      void (async () => {
        try {
          const auth = await authPromise
          const storeId = parseStoreId(payload?.storeId)
          if (storeId == null) {
            console.log('[websocket] JOIN_STORE invalid storeId:', payload?.storeId)
            return
          }
          await joinStoreRoomForSocket(socket, auth.userId, storeId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Forbidden store access'
          if (message === 'Unauthorized') {
            console.log('[websocket] JOIN_STORE rejected, unauthorized socket:', socket.id)
            socket.emit('error', { message: 'Unauthorized' })
            socket.disconnect(true)
            return
          }
          console.error('[websocket] JOIN_STORE failed:', err)
          socket.emit('error', { message: 'Forbidden store access' })
        }
      })()
    })

    void authPromise.catch((err) => {
      console.log('[websocket] auth failed, disconnecting socket:', socket.id, err)
      socket.emit('error', { message: 'Unauthorized' })
      socket.disconnect(true)
    })
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

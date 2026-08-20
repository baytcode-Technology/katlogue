import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { isInstagramReadyForStore } from './instagram-api.service.js'

export type InstagramMediaKind = 'image' | 'audio' | 'video'

const CHAT_MEDIA_BUCKET = 'instagram-chat-media'

async function ensureChatMediaBucket(): Promise<void> {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) {
    throw new AppError(500, listError.message, 'STORAGE_LIST_FAILED')
  }
  if (buckets?.some((b) => b.name === CHAT_MEDIA_BUCKET)) return

  const { error: createError } = await supabaseAdmin.storage.createBucket(CHAT_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mp4',
      'audio/aac',
      'audio/mpeg',
      'audio/wav',
      'audio/x-m4a',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ],
  })

  if (createError) {
    const exists =
      createError.message.toLowerCase().includes('already exists') ||
      createError.message.toLowerCase().includes('duplicate')
    if (!exists) {
      throw new AppError(
        500,
        `Storage bucket "${CHAT_MEDIA_BUCKET}" is missing. Create a public bucket named "${CHAT_MEDIA_BUCKET}" in Supabase Storage.`,
        'BUCKET_NOT_FOUND'
      )
    }
  }
}

export function inferInstagramMediaKind(input: {
  kindRaw: string
  mimeType: string
  filename: string
}): InstagramMediaKind {
  const kind = input.kindRaw.trim().toLowerCase()
  if (kind === 'image' || kind === 'audio' || kind === 'video') return kind

  const mime = input.mimeType.toLowerCase()
  const name = input.filename.toLowerCase()
  if (mime.startsWith('audio/') || /\.(m4a|aac|mp3|wav|mp4)$/.test(name)) return 'audio'
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|avi)$/.test(name)) return 'video'
  return 'image'
}

function extensionFromMime(mime: string, kind: InstagramMediaKind): string {
  const lower = mime.toLowerCase()
  if (kind === 'image') {
    if (lower.includes('png')) return 'png'
    if (lower.includes('webp')) return 'webp'
    return 'jpg'
  }
  if (kind === 'video') {
    if (lower.includes('webm')) return 'webm'
    if (lower.includes('quicktime') || lower.includes('mov')) return 'mov'
    return 'mp4'
  }
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  return 'm4a'
}

function normalizeMime(mime: string, kind: InstagramMediaKind): string {
  const lower = mime.toLowerCase()
  if (kind === 'image') {
    if (lower.includes('png')) return 'image/png'
    if (lower.includes('webp')) return 'image/webp'
    return 'image/jpeg'
  }
  if (kind === 'video') {
    if (lower.includes('webm')) return 'video/webm'
    if (lower.includes('quicktime')) return 'video/quicktime'
    return 'video/mp4'
  }
  if (lower.includes('wav')) return 'audio/wav'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio/mpeg'
  if (lower.includes('aac')) return 'audio/aac'
  return 'audio/mp4'
}

/** Upload local bytes to public storage so Instagram can fetch via URL. */
export async function uploadInstagramChatMedia(input: {
  storeId: number
  ownerId: string
  kind: InstagramMediaKind
  buffer: Buffer
  mimeType: string
  filename: string
}): Promise<{ mediaUrl: string; mimeType: string }> {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  if (!isInstagramReadyForStore(store)) {
    throw new AppError(503, 'Instagram is not connected for this store', 'INSTAGRAM_NOT_CONFIGURED')
  }

  await ensureChatMediaBucket()

  const mimeType = normalizeMime(input.mimeType, input.kind)
  const ext = extensionFromMime(mimeType, input.kind)
  const path = `${input.storeId}/${randomUUID()}.${ext}`

  const { error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).upload(path, input.buffer, {
    contentType: mimeType,
    upsert: false,
  })

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_MEDIA_UPLOAD_FAILED')
  }

  const { data } = supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path)
  if (!data.publicUrl) {
    throw new AppError(500, 'Failed to resolve public media URL', 'INSTAGRAM_MEDIA_UPLOAD_FAILED')
  }

  return { mediaUrl: data.publicUrl, mimeType }
}

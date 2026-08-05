import axios from 'axios'
import FormData from 'form-data'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { transcodeVoiceNoteToOgg } from './transcode-voice-note.service.js'
import {
  resolveStoreWhatsAppCredentials,
  type WhatsAppCredentials,
} from './whatsapp.service.js'

export type WhatsAppMediaKind = 'image' | 'audio' | 'video'

function graphMediaUrl(credentials: WhatsAppCredentials): string {
  return `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/media`
}

function normalizeMime(mime: string, kind: WhatsAppMediaKind): string {
  const lower = mime.toLowerCase()
  if (kind === 'image') {
    if (lower.includes('png')) return 'image/png'
    if (lower.includes('webp')) return 'image/webp'
    return 'image/jpeg'
  }
  if (kind === 'video') {
    if (lower.includes('3gp')) return 'video/3gpp'
    return 'video/mp4'
  }
  if (lower.includes('ogg')) return 'audio/ogg'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio/mpeg'
  if (lower.includes('aac')) return 'audio/aac'
  if (lower.includes('amr')) return 'audio/amr'
  return 'audio/mp4'
}

export async function uploadWhatsAppMediaToMeta(input: {
  storeId: number
  ownerId: string
  kind: WhatsAppMediaKind
  buffer: Buffer
  mimeType: string
  filename: string
  voice?: boolean
}): Promise<{ mediaId: string; mimeType: string }> {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const credentials = resolveStoreWhatsAppCredentials(store)
  if (!credentials) {
    throw new AppError(503, 'WhatsApp is not connected for this store', 'WHATSAPP_NOT_CONNECTED')
  }

  let buffer = input.buffer
  let filename = input.filename
  let mimeType = input.mimeType

  if (input.kind === 'audio' && input.voice) {
    const transcoded = await transcodeVoiceNoteToOgg({
      buffer: input.buffer,
      mimeType: input.mimeType,
    })
    buffer = transcoded.buffer
    filename = transcoded.filename
    mimeType = transcoded.mimeType
  }

  mimeType = normalizeMime(mimeType, input.kind)
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mimeType)
  form.append('file', buffer, { filename, contentType: mimeType })

  try {
    const { data } = await axios.post<{ id?: string }>(graphMediaUrl(credentials), form, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        ...form.getHeaders(),
      },
      timeout: 120_000,
      maxBodyLength: 20 * 1024 * 1024,
    })

    const mediaId = data.id?.trim()
    if (!mediaId) {
      throw new AppError(502, 'Meta did not return a media id', 'WHATSAPP_MEDIA_UPLOAD_FAILED')
    }

    return { mediaId, mimeType }
  } catch (err) {
    if (err instanceof AppError) throw err
    const message =
      axios.isAxiosError(err) && err.response?.data
        ? String((err.response.data as { error?: { message?: string } }).error?.message ?? 'Upload failed')
        : 'Failed to upload media to WhatsApp'
    throw new AppError(400, message, 'WHATSAPP_MEDIA_UPLOAD_FAILED')
  }
}

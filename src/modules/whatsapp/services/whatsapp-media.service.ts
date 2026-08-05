import axios from 'axios'

import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { resolveStoreWhatsAppCredentials } from './whatsapp.service.js'

export async function assertStoreOwnsWhatsAppMedia(input: {
  storeId: number
  mediaId: string
}): Promise<void> {
  const message = await chatRepository.findMessageByMediaForStore({
    storeId: input.storeId,
    mediaId: input.mediaId,
  })

  if (!message) {
    throw new AppError(404, 'Media not found for this store', 'WHATSAPP_MEDIA_NOT_FOUND')
  }
}

export async function downloadWhatsAppMedia(input: {
  storeId: number
  mediaId: string
}): Promise<{ buffer: Buffer; mimeType: string }> {
  await assertStoreOwnsWhatsAppMedia(input)

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const credentials = resolveStoreWhatsAppCredentials(store)
  if (!credentials) {
    throw new AppError(503, 'WhatsApp is not connected for this store', 'WHATSAPP_NOT_CONNECTED')
  }

  const metaUrl = `https://graph.facebook.com/${credentials.apiVersion}/${input.mediaId}`
  const { data: meta } = await axios.get<{ url?: string; mime_type?: string }>(metaUrl, {
    params: { access_token: credentials.accessToken },
    timeout: 15_000,
  })

  const downloadUrl = meta.url?.trim()
  if (!downloadUrl) {
    throw new AppError(502, 'Meta did not return a media download URL', 'WHATSAPP_MEDIA_URL_FAILED')
  }

  const mimeType = meta.mime_type?.trim() || 'application/octet-stream'

  const { data: fileData } = await axios.get<ArrayBuffer>(downloadUrl, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: 50 * 1024 * 1024,
  })

  return { buffer: Buffer.from(fileData), mimeType }
}

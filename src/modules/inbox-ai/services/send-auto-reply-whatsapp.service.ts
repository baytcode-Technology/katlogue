import axios from 'axios'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { recordOutboundWhatsAppMessage } from '../../whatsapp/services/record-outbound-whatsapp-message.service.js'
import { uploadWhatsAppMediaBuffer } from '../../whatsapp/services/upload-whatsapp-media.service.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendMediaMessage,
  sendTextMessage,
} from '../../whatsapp/services/whatsapp.service.js'

function imageFileFromResponse(imageUrl: string, contentType: unknown): {
  mimeType: string
  filename: string
} {
  const header = typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : ''
  let path = imageUrl.toLowerCase()
  try {
    path = new URL(imageUrl).pathname.toLowerCase()
  } catch {
    // keep the raw string for extension checks
  }

  const mimeType =
    header === 'image/png' || header === 'image/webp' || header === 'image/gif' || header === 'image/jpeg'
      ? header
      : path.endsWith('.png')
        ? 'image/png'
        : path.endsWith('.webp')
          ? 'image/webp'
          : path.endsWith('.gif')
            ? 'image/gif'
            : 'image/jpeg'

  const ext =
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'jpg'

  return { mimeType, filename: `product.${ext}` }
}

export async function sendAutoReplyWhatsAppText(input: {
  storeId: number
  conversationId: number
  customerWaNumber: string
  message: string
}): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store || !isWhatsAppReadyForStore(store)) return

  const credentials = resolveStoreWhatsAppCredentials(store)!
  const customerWaNumber = input.customerWaNumber.trim()
  const message = input.message.trim()
  if (!message) return

  const metaResult = await sendTextMessage({
    to: customerWaNumber,
    message,
    credentials,
  })

  await recordOutboundWhatsAppMessage({
    store,
    phoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    metaMessageId: metaResult.metaMessageId,
    type: 'text',
    textBody: message,
    preview: message,
    rawPayload: { ...(metaResult.raw as object), source: 'inbox_ai' },
    duplicate: 'reload',
  })
}

export async function sendAutoReplyWhatsAppImage(input: {
  storeId: number
  conversationId: number
  customerWaNumber: string
  imageUrl: string
  caption?: string
}): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store || !isWhatsAppReadyForStore(store)) return

  const credentials = resolveStoreWhatsAppCredentials(store)!
  const customerWaNumber = input.customerWaNumber.trim()

  const response = await axios.get<ArrayBuffer>(input.imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30_000,
  })
  const file = imageFileFromResponse(input.imageUrl, response.headers['content-type'])
  const uploaded = await uploadWhatsAppMediaBuffer({
    credentials,
    kind: 'image',
    buffer: Buffer.from(response.data),
    mimeType: file.mimeType,
    filename: file.filename,
  })

  const metaResult = await sendMediaMessage({
    to: customerWaNumber,
    type: 'image',
    mediaId: uploaded.mediaId,
    caption: input.caption,
    credentials,
  })

  const preview = input.caption?.trim() || 'Photo'
  await recordOutboundWhatsAppMessage({
    store,
    phoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    metaMessageId: metaResult.metaMessageId,
    type: 'image',
    textBody: preview,
    preview,
    mediaId: uploaded.mediaId,
    mimeType: uploaded.mimeType,
    caption: input.caption ?? null,
    rawPayload: { ...(metaResult.raw as object), source: 'inbox_ai' },
    duplicate: 'reload',
  })
}

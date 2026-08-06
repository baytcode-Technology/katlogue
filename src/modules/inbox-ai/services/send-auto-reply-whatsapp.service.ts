import axios from 'axios'
import FormData from 'form-data'
import { AppError } from '../../../shared/errors/app.error.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import { emitOutboundWhatsAppMessage } from '../../whatsapp/services/emit-outbound-message.service.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendMediaMessage,
  sendTextMessage,
  type WhatsAppCredentials,
} from '../../whatsapp/services/whatsapp.service.js'

function graphMediaUrl(credentials: WhatsAppCredentials): string {
  return `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/media`
}

async function uploadImageFromUrl(
  credentials: WhatsAppCredentials,
  imageUrl: string
): Promise<string> {
  const response = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30_000,
  })
  const buffer = Buffer.from(response.data)
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'image/jpeg')
  form.append('file', buffer, { filename: 'product.jpg', contentType: 'image/jpeg' })

  const { data } = await axios.post<{ id?: string }>(graphMediaUrl(credentials), form, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      ...form.getHeaders(),
    },
    timeout: 60_000,
  })

  const mediaId = data.id?.trim()
  if (!mediaId) {
    throw new AppError(502, 'Meta did not return a media id', 'WHATSAPP_MEDIA_UPLOAD_FAILED')
  }
  return mediaId
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

  const now = new Date().toISOString()
  const customer = await customerRepository.findOrCreateByWhatsApp(store.id, customerWaNumber)

  const conversation = await chatRepository.upsertConversation({
    storeId: store.id,
    waPhoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: message,
  })

  const saved = await chatRepository.insertMessage({
    storeId: store.id,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromNumber: store.whatsapp_number,
    toNumber: customerWaNumber,
    type: 'text',
    textBody: message,
    status: 'sent',
    rawPayload: { ...(metaResult.raw as object), source: 'inbox_ai' },
    timestamp: now,
  })

  if (saved) {
    emitOutboundWhatsAppMessage({ storeId: store.id, conversation, message: saved })
  }
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

  const mediaId = await uploadImageFromUrl(credentials, input.imageUrl)
  const metaResult = await sendMediaMessage({
    to: customerWaNumber,
    type: 'image',
    mediaId,
    caption: input.caption,
    credentials,
  })

  const now = new Date().toISOString()
  const customer = await customerRepository.findOrCreateByWhatsApp(store.id, customerWaNumber)
  const preview = input.caption?.trim() || 'Photo'

  const conversation = await chatRepository.upsertConversation({
    storeId: store.id,
    waPhoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: preview,
  })

  const saved = await chatRepository.insertMessage({
    storeId: store.id,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromNumber: store.whatsapp_number,
    toNumber: customerWaNumber,
    type: 'image',
    textBody: preview,
    mediaId,
    mimeType: 'image/jpeg',
    caption: input.caption ?? null,
    status: 'sent',
    rawPayload: { ...(metaResult.raw as object), source: 'inbox_ai' },
    timestamp: now,
  })

  if (saved) {
    emitOutboundWhatsAppMessage({ storeId: store.id, conversation, message: saved })
  }
}

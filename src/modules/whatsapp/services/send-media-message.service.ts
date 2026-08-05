import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { emitOutboundWhatsAppMessage } from './emit-outbound-message.service.js'
import { formatWhatsAppMessagePreview } from './whatsapp-message-content.service.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendMediaMessage,
} from './whatsapp.service.js'

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

async function assertWithinSessionWindow(input: {
  storeId: number
  customerWaNumber: string
}) {
  const lastInbound = await chatRepository.getLastInboundMessageAt({
    storeId: input.storeId,
    customerWaNumber: input.customerWaNumber,
  })
  if (!lastInbound) return
  const elapsed = Date.now() - new Date(lastInbound).getTime()
  if (elapsed > SESSION_WINDOW_MS) {
    throw new AppError(
      403,
      'Outside the 24-hour WhatsApp session window. Send a template message instead.',
      'WHATSAPP_SESSION_EXPIRED'
    )
  }
}

export type SendWhatsAppMediaInput = {
  storeId: number
  ownerId: string
  to: string
  type: 'image' | 'audio' | 'video'
  mediaId: string
  mimeType?: string | null
  caption?: string | null
  voice?: boolean
  conversationId?: number | null
}

function previewForType(type: string, caption?: string | null): string {
  if (caption?.trim()) return caption.trim()
  if (type === 'image') return 'Photo'
  if (type === 'video') return 'Video'
  if (type === 'audio') return 'Voice message'
  return `[${type}]`
}

export async function sendWhatsAppMediaMessage(input: SendWhatsAppMediaInput) {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  if (!isWhatsAppReadyForStore(store)) {
    throw new AppError(503, 'WhatsApp is not configured for this store', 'WHATSAPP_NOT_CONFIGURED')
  }

  const credentials = resolveStoreWhatsAppCredentials(store)!
  const customerWaNumber = normalizeWhatsAppNumber(input.to)
  const preview = previewForType(input.type, input.caption)

  let conversation =
    (input.conversationId
      ? await chatRepository.findConversationById({
          storeId: input.storeId,
          conversationId: input.conversationId,
        })
      : null) ??
    (await chatRepository.findConversationByCustomer({
      storeId: input.storeId,
      customerWaNumber,
    }))

  const customer = await customerRepository.findOrCreateByWhatsApp(input.storeId, customerWaNumber)
  await assertWithinSessionWindow({ storeId: input.storeId, customerWaNumber })

  const metaResult = await sendMediaMessage({
    to: customerWaNumber,
    credentials,
    type: input.type,
    mediaId: input.mediaId,
    caption: input.caption,
    voice: input.voice,
    mimeType: input.mimeType,
  })

  const now = new Date().toISOString()
  conversation = await chatRepository.upsertConversation({
    storeId: input.storeId,
    waPhoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: preview,
  })

  const saved = await chatRepository.insertMessage({
    storeId: input.storeId,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromNumber: store.whatsapp_number,
    toNumber: customerWaNumber,
    type: input.type,
    textBody: formatWhatsAppMessagePreview({ type: input.type, textBody: preview }),
    mediaId: input.mediaId,
    mimeType: input.mimeType ?? null,
    caption: input.caption ?? null,
    status: 'sent',
    rawPayload: metaResult.raw,
    timestamp: now,
  })

  if (!saved) {
    throw new AppError(500, 'Failed to persist outbound message', 'WHATSAPP_MESSAGE_SAVE_FAILED')
  }

  emitOutboundWhatsAppMessage({ storeId: input.storeId, conversation, message: saved })

  return { conversation, message: saved, metaMessageId: metaResult.metaMessageId }
}

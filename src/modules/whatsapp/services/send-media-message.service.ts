import { AppError } from '../../../shared/errors/app.error.js'
import { assertWithinMessagingWindow } from '../../../shared/lib/session-window.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { recordOutboundWhatsAppMessage } from './record-outbound-whatsapp-message.service.js'
import { formatWhatsAppMessagePreview } from './whatsapp-message-content.service.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendMediaMessage,
} from './whatsapp.service.js'

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
  const preview = previewForType(input.type, input.caption)

  const conversation =
    (input.conversationId
      ? await chatRepository.findConversationById({
          storeId: input.storeId,
          conversationId: input.conversationId,
        })
      : null) ??
    (await chatRepository.findConversationByCustomer({
      storeId: input.storeId,
      customerWaNumber: normalizeWhatsAppNumber(input.to),
    }))

  const customerWaNumber = conversation?.customer_wa_number
    ? normalizeWhatsAppNumber(conversation.customer_wa_number)
    : normalizeWhatsAppNumber(input.to)

  const lastInbound = await chatRepository.getLastInboundMessageAt({
    storeId: input.storeId,
    customerWaNumber,
  })
  assertWithinMessagingWindow({
    lastInboundAt: lastInbound,
    expiredMessage: 'Outside the 24-hour WhatsApp session window. Send a template message instead.',
    expiredCode: 'WHATSAPP_SESSION_EXPIRED',
  })

  const sendVoice =
    input.type === 'audio' &&
    input.mimeType?.toLowerCase().includes('ogg') === true

  const metaResult = await sendMediaMessage({
    to: customerWaNumber,
    credentials,
    type: input.type,
    mediaId: input.mediaId,
    caption: input.caption,
    voice: sendVoice,
    mimeType: input.mimeType,
  })

  const recorded = await recordOutboundWhatsAppMessage({
    store,
    phoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    metaMessageId: metaResult.metaMessageId,
    type: input.type,
    textBody: formatWhatsAppMessagePreview({ type: input.type, textBody: preview }),
    preview,
    mediaId: input.mediaId,
    mimeType: input.mimeType ?? null,
    caption: input.caption ?? null,
    rawPayload: metaResult.raw,
    duplicate: 'throw',
  })

  return {
    conversation: recorded.conversation,
    message: recorded.message,
    metaMessageId: metaResult.metaMessageId,
  }
}

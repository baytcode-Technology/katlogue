import { AppError } from '../../../shared/errors/app.error.js'
import { assertWithinMessagingWindow } from '../../../shared/lib/session-window.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { pauseInboxAiForConversation } from '../../inbox-ai/index.js'
import type { WhatsAppConversation } from '../types/whatsapp-chat.types.js'
import { recordOutboundWhatsAppMessage } from './record-outbound-whatsapp-message.service.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendTextMessage,
} from './whatsapp.service.js'

export type SendWhatsAppTextInput = {
  storeId: number
  ownerId: string
  to: string
  message: string
  conversationId?: number | null
}

function emitConversationUpdated(storeId: number, conversation: WhatsAppConversation) {
  emitToStore(storeId, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    storeId,
    conversation: {
      id: conversation.id,
      customer_wa_number: conversation.customer_wa_number,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: conversation.unread_count,
      reply_mode: conversation.reply_mode,
      ai_paused_until: conversation.ai_paused_until,
      staff_waiting_at: conversation.staff_waiting_at,
      staff_warned_at: conversation.staff_warned_at,
    },
  })
}

export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput) {
  await storeRepository.assertStoreMember(input.storeId, input.ownerId)

  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!isWhatsAppReadyForStore(store)) {
    throw new AppError(503, 'WhatsApp is not configured for this store', 'WHATSAPP_NOT_CONFIGURED')
  }

  const credentials = resolveStoreWhatsAppCredentials(store)!
  const customerWaNumber = normalizeWhatsAppNumber(input.to)
  const message = input.message.trim()

  const lastInbound = await chatRepository.getLastInboundMessageAt({
    storeId: input.storeId,
    customerWaNumber,
  })
  assertWithinMessagingWindow({
    lastInboundAt: lastInbound,
    expiredMessage: 'Outside the 24-hour WhatsApp session window. Send a template message instead.',
    expiredCode: 'WHATSAPP_SESSION_EXPIRED',
  })

  const metaResult = await sendTextMessage({
    to: customerWaNumber,
    message,
    credentials,
  })

  const { conversation, message: saved } = await recordOutboundWhatsAppMessage({
    store,
    phoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    metaMessageId: metaResult.metaMessageId,
    type: 'text',
    textBody: message,
    preview: message,
    rawPayload: metaResult.raw,
    duplicate: 'throw',
  })

  await pauseInboxAiForConversation({
    channel: 'whatsapp',
    storeId: input.storeId,
    conversationId: conversation.id,
  })

  const refreshed = await chatRepository.findConversationById({
    storeId: input.storeId,
    conversationId: conversation.id,
  })
  if (refreshed) emitConversationUpdated(input.storeId, refreshed)

  return {
    conversation,
    message: saved,
    metaMessageId: metaResult.metaMessageId,
  }
}

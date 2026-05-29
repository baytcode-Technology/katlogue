import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import {
  isWhatsAppReadyForStore,
  resolveStoreWhatsAppCredentials,
  sendTextMessage,
} from './whatsapp.service.js'

export type SendWhatsAppTextInput = {
  storeId: string
  ownerId: string
  to: string
  message: string
  conversationId?: string | null
}

export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput) {
  await storeRepository.assertStoreOwner(input.storeId, input.ownerId)

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

  const metaResult = await sendTextMessage({
    to: customerWaNumber,
    message,
    credentials,
  })

  const now = new Date().toISOString()

  conversation = await chatRepository.upsertConversation({
    storeId: input.storeId,
    waPhoneNumberId: credentials.phoneNumberId,
    customerWaNumber,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: message,
  })

  const saved = await chatRepository.insertMessage({
    storeId: input.storeId,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromNumber: store.whatsapp_number,
    toNumber: customerWaNumber,
    type: 'text',
    textBody: message,
    status: 'sent',
    rawPayload: metaResult.raw,
    timestamp: now,
  })

  if (!saved) {
    throw new AppError(500, 'Failed to persist outbound message', 'WHATSAPP_MESSAGE_SAVE_FAILED')
  }

  emitToStore(input.storeId, SOCKET_EVENTS.MESSAGE_NEW, {
    storeId: input.storeId,
    conversationId: conversation.id,
    message: {
      id: saved.id,
      meta_message_id: saved.meta_message_id,
      direction: saved.direction,
      type: saved.type,
      text_body: saved.text_body,
      status: saved.status,
      timestamp: saved.timestamp,
      from_number: saved.from_number,
      to_number: saved.to_number,
    },
  })

  emitToStore(input.storeId, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    storeId: input.storeId,
    conversation: {
      id: conversation.id,
      customer_wa_number: conversation.customer_wa_number,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: conversation.unread_count,
    },
  })

  return {
    conversation,
    message: saved,
    metaMessageId: metaResult.metaMessageId,
  }
}

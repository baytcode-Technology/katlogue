import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import {
  isInstagramReadyForStore,
  resolveStoreInstagramCredentials,
  sendInstagramTextMessage,
} from '../../instagram/services/instagram-api.service.js'

export async function sendAutoReplyInstagramText(input: {
  storeId: number
  conversationId: number
  customerIgId: string
  message: string
}): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store || !isInstagramReadyForStore(store)) return

  const credentials = resolveStoreInstagramCredentials(store)!
  const customerIgId = input.customerIgId.trim()
  const message = input.message.trim()
  if (!message) return

  const metaResult = await sendInstagramTextMessage({
    igUserId: credentials.igUserId,
    accessToken: credentials.accessToken,
    recipientIgId: customerIgId,
    message,
  })

  const now = new Date().toISOString()
  const customer = await customerRepository.findOrCreateByInstagram(store.id, customerIgId)

  const conversation = await chatRepository.upsertConversation({
    storeId: store.id,
    customerIgId,
    igUserId: credentials.igUserId,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: message,
  })

  const saved = await chatRepository.insertMessage({
    storeId: store.id,
    conversationId: conversation.id,
    metaMessageId: metaResult.metaMessageId,
    direction: 'outbound',
    fromIgId: credentials.igUserId,
    toIgId: customerIgId,
    type: 'text',
    textBody: message,
    status: 'sent',
    rawPayload: { ...(metaResult.raw as Record<string, unknown>), source: 'inbox_ai' },
    timestamp: now,
  })

  const messageToEmit =
    saved ?? (await chatRepository.findMessageByMetaMessageId(metaResult.metaMessageId))
  if (!messageToEmit) return

  emitToStore(store.id, SOCKET_EVENTS.INSTAGRAM_MESSAGE_NEW, {
    storeId: Number(store.id),
    conversationId: Number(conversation.id),
    message: {
      id: Number(messageToEmit.id),
      meta_message_id: messageToEmit.meta_message_id,
      direction: messageToEmit.direction,
      type: messageToEmit.type,
      text_body: messageToEmit.text_body,
      status: messageToEmit.status,
      timestamp: messageToEmit.timestamp,
      from_ig_id: messageToEmit.from_ig_id,
      to_ig_id: messageToEmit.to_ig_id,
    },
  })

  emitToStore(store.id, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId: Number(store.id),
    conversation: {
      id: Number(conversation.id),
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: Number(conversation.unread_count ?? 0),
    },
  })
}

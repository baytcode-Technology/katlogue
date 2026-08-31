import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import type { InstagramConversation } from '../types/instagram-chat.types.js'
import { ensureInstagramCustomerUsername } from './ensure-instagram-customer-username.service.js'

export async function markInstagramChatRead(
  ownerId: string,
  storeId: number,
  conversationId: number
): Promise<InstagramConversation> {
  await storeRepository.assertStoreMember(storeId, ownerId)

  const existing = await chatRepository.findConversationById({ storeId, conversationId })
  if (!existing) {
    throw new AppError(404, 'Conversation not found', 'INSTAGRAM_CONVERSATION_NOT_FOUND')
  }

  const store = await storeRepository.findStoreById(storeId)

  if (store && !existing.customer_ig_username) {
    try {
      await ensureInstagramCustomerUsername({
        store,
        conversationId,
        customerIgId: existing.customer_ig_id,
        existingUsername: existing.customer_ig_username,
      })
    } catch (err) {
      console.error('[instagram] profile lookup failed on mark read', err)
    }
  }

  let conversation = await chatRepository.resetUnreadCount({ storeId, conversationId })

  if (!conversation.customer_ig_username) {
    const refreshed = await chatRepository.findConversationById({ storeId, conversationId })
    if (refreshed) conversation = refreshed
  }

  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId,
    conversation: {
      id: conversation.id,
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: 0,
      reply_mode: conversation.reply_mode,
      ai_paused_until: conversation.ai_paused_until,
    },
  })

  return conversation
}

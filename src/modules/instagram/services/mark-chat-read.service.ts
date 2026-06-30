import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import type { InstagramConversation } from '../types/instagram-chat.types.js'

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

  const conversation = await chatRepository.resetUnreadCount({ storeId, conversationId })

  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId,
    conversation: {
      id: conversation.id,
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: 0,
    },
  })

  return conversation
}

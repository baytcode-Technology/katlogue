import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import type { WhatsAppConversation } from '../types/whatsapp-chat.types.js'

export async function markWhatsAppChatRead(
  ownerId: string,
  storeId: number,
  conversationId: number
): Promise<WhatsAppConversation> {
  await storeRepository.assertStoreMember(storeId, ownerId)

  const existing = await chatRepository.findConversationById({ storeId, conversationId })
  if (!existing) {
    throw new AppError(404, 'Conversation not found', 'WHATSAPP_CONVERSATION_NOT_FOUND')
  }

  const conversation = await chatRepository.resetUnreadCount({ storeId, conversationId })

  emitToStore(storeId, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    storeId,
    conversation: {
      id: conversation.id,
      customer_wa_number: conversation.customer_wa_number,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: 0,
    },
  })

  return conversation
}

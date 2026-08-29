import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import type { WhatsAppConversation, WhatsAppMessage } from '../types/whatsapp-chat.types.js'

export function emitOutboundWhatsAppMessage(input: {
  storeId: number
  conversation: WhatsAppConversation
  message: WhatsAppMessage
}) {
  emitToStore(input.storeId, SOCKET_EVENTS.MESSAGE_NEW, {
    storeId: Number(input.storeId),
    conversationId: Number(input.conversation.id),
    message: {
      id: Number(input.message.id),
      meta_message_id: input.message.meta_message_id,
      direction: input.message.direction,
      type: input.message.type,
      text_body: input.message.text_body,
      media_id: input.message.media_id,
      mime_type: input.message.mime_type,
      caption: input.message.caption,
      raw_payload: input.message.raw_payload,
      status: input.message.status,
      timestamp: input.message.timestamp,
      from_number: input.message.from_number,
      to_number: input.message.to_number,
    },
  })

  emitToStore(input.storeId, SOCKET_EVENTS.CONVERSATION_UPDATED, {
    storeId: Number(input.storeId),
    conversation: {
      id: Number(input.conversation.id),
      customer_wa_number: input.conversation.customer_wa_number,
      last_message_at: input.conversation.last_message_at,
      last_message_preview: input.conversation.last_message_preview,
      unread_count: Number(input.conversation.unread_count ?? 0),
      reply_mode: input.conversation.reply_mode,
      ai_paused_until: input.conversation.ai_paused_until,
    },
  })
}

import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as whatsappChatRepository from '../../whatsapp/repositories/whatsapp-chat.repository.js'
import * as instagramChatRepository from '../../instagram/repositories/instagram-chat.repository.js'
import { updateConversationReplyMode } from '../repositories/conversation-ai.repository.js'

type Channel = 'whatsapp' | 'instagram'

export function createSetReplyModeController(channel: Channel) {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

    const { conversationId } = req.params as { conversationId: string }
    const q = req.validatedQuery as { store_id: number }
    const storeId = q.store_id
    const { reply_mode: replyMode } = req.body as { reply_mode: 'ai' | 'manual' }
    const id = Number(conversationId)

    await storeRepository.assertStoreMember(storeId, req.authUser.id)

    await updateConversationReplyMode({
      channel,
      storeId,
      conversationId: id,
      replyMode,
    })

    if (channel === 'whatsapp') {
      const conversation = await whatsappChatRepository.findConversationById({
        storeId,
        conversationId: id,
      })
      if (conversation) {
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
    } else {
      const conversation = await instagramChatRepository.findConversationById({
        storeId,
        conversationId: id,
      })
      if (conversation) {
        emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
          storeId,
          conversation: {
            id: conversation.id,
            customer_ig_id: conversation.customer_ig_id,
            customer_ig_username: conversation.customer_ig_username,
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
    }

    res.status(200).json({
      success: true,
      message: 'Reply mode updated',
      data: { conversation_id: id, reply_mode: replyMode },
    })
  })
}

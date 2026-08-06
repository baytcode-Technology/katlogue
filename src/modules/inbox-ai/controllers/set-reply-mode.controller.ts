import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { updateConversationReplyMode } from '../repositories/conversation-ai.repository.js'

type Channel = 'whatsapp' | 'instagram'

export function createSetReplyModeController(channel: Channel) {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

    const { conversationId } = req.params as { conversationId: string }
    const q = req.validatedQuery as { store_id: number }
    const storeId = q.store_id
    const { reply_mode: replyMode } = req.body as { reply_mode: 'ai' | 'manual' }

    await storeRepository.assertStoreMember(storeId, req.authUser.id)

    await updateConversationReplyMode({
      channel,
      storeId,
      conversationId: Number(conversationId),
      replyMode,
    })

    res.status(200).json({
      success: true,
      message: 'Reply mode updated',
      data: { conversation_id: Number(conversationId), reply_mode: replyMode },
    })
  })
}

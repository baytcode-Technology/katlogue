import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { forwardWhatsAppMessage } from '../services/forward-whatsapp-message.service.js'
import type { ForwardMessageBody } from '../validations/send-media.validation.js'

export const forwardMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as ForwardMessageBody
  const storeId = body.storeId ?? body.store_id!
  const sourceMessageId = body.sourceMessageId ?? body.source_message_id!
  const targetConversationId = body.targetConversationId ?? body.target_conversation_id!

  const result = await forwardWhatsAppMessage({
    storeId,
    ownerId: req.authUser.id,
    sourceMessageId,
    targetConversationId,
  })

  res.status(200).json({
    success: true,
    message: 'Message forwarded successfully',
    data: {
      store_id: storeId,
      conversation_id: result.conversation.id,
      message: result.message,
      meta_message_id: result.metaMessageId,
    },
  })
})

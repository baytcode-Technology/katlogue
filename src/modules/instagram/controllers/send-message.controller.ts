import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { sendInstagramTextMessageService } from '../services/send-instagram-message.service.js'
import type { SendMessageBody } from '../validations/send-message.validation.js'

export const sendInstagramMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as SendMessageBody
  const storeId = body.storeId ?? body.store_id!

  const result = await sendInstagramTextMessageService({
    storeId,
    ownerId: req.authUser.id,
    to: body.to,
    message: body.message,
    conversationId: body.conversationId ?? body.conversation_id ?? null,
  })

  res.status(200).json({
    success: true,
    message: 'Message sent successfully',
    data: {
      store_id: storeId,
      conversation_id: result.conversation.id,
      message: result.message,
      meta_message_id: result.metaMessageId,
    },
  })
})

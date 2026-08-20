import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { sendInstagramMediaMessageService } from '../services/send-instagram-media.service.js'
import type { SendInstagramMediaBody } from '../validations/send-media.validation.js'

export const sendInstagramMedia = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as SendInstagramMediaBody
  const storeId = body.storeId ?? body.store_id!

  const result = await sendInstagramMediaMessageService({
    storeId,
    ownerId: req.authUser.id,
    to: body.to,
    type: body.type,
    mediaUrl: body.mediaUrl,
    mimeType: body.mimeType,
    caption: body.caption,
    conversationId: body.conversationId ?? body.conversation_id ?? null,
  })

  res.status(200).json({
    success: true,
    message: 'Media message sent successfully',
    data: {
      store_id: storeId,
      conversation_id: result.conversation.id,
      message: result.message,
      meta_message_id: result.metaMessageId,
    },
  })
})

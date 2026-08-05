import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { sendWhatsAppMediaMessage } from '../services/send-media-message.service.js'
import type { SendMediaBody } from '../validations/send-media.validation.js'

export const sendMedia = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as SendMediaBody
  const storeId = body.storeId ?? body.store_id!

  const result = await sendWhatsAppMediaMessage({
    storeId,
    ownerId: req.authUser.id,
    to: body.to,
    type: body.type,
    mediaId: body.mediaId,
    mimeType: body.mimeType,
    caption: body.caption,
    voice: body.voice,
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

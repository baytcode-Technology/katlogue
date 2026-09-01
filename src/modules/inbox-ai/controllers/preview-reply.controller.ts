import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { previewInboxAiReply } from '../services/preview-inbox-ai-reply.service.js'

export const previewInboxAiReplyController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const { storeId } = req.params as { storeId: string }
  const body = req.body as { message: string; channel?: 'whatsapp' | 'instagram' }

  await storeRepository.assertStoreMember(Number(storeId), req.authUser.id)

  const data = await previewInboxAiReply({
    storeId: Number(storeId),
    message: body.message,
    channel: body.channel ?? 'whatsapp',
  })

  res.status(200).json({
    success: true,
    message: 'Inbox AI preview generated',
    data,
  })
})

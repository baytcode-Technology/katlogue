import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as markChatReadService from '../services/mark-chat-read.service.js'
import type { ListChatsQuery } from '../validations/chats.validation.js'
import type { ListMessagesParams } from '../validations/chats.validation.js'

export const markChatRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as ListChatsQuery
  const { conversationId } = req.params as ListMessagesParams
  const conversation = await markChatReadService.markWhatsAppChatRead(
    req.authUser.id,
    store_id,
    conversationId
  )

  res.status(200).json({
    success: true,
    message: 'Conversation marked as read',
    data: { conversation },
  })
})

import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import type {
  ListMessagesParams,
  ListMessagesQuery,
} from '../validations/chats.validation.js'

export const listChatMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const params = req.params as unknown as ListMessagesParams
  const q = req.validatedQuery as ListMessagesQuery

  await storeRepository.assertStoreMember(q.store_id, req.authUser.id)

  const messages = await chatRepository.listMessages({
    storeId: q.store_id,
    conversationId: params.conversationId,
    limit: q.limit,
    cursor: q.cursor ?? null,
  })

  res.status(200).json({
    success: true,
    message: 'Messages fetched successfully',
    data: {
      store_id: q.store_id,
      conversation_id: params.conversationId,
      messages,
      nextCursor: messages.length ? messages[messages.length - 1]?.timestamp : null,
    },
  })
})


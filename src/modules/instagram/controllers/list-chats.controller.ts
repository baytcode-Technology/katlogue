import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import type { ListChatsQuery } from '../validations/chats.validation.js'

export const listInstagramChats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const q = req.validatedQuery as ListChatsQuery
  await storeRepository.assertStoreOwner(q.store_id, req.authUser.id)

  const chats = await chatRepository.listConversations(q.store_id)

  res.status(200).json({
    success: true,
    message: 'Chats fetched successfully',
    data: { store_id: q.store_id, chats, count: chats.length },
  })
})

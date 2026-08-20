import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { parseStoreIdFromBody } from '../../../shared/utils/parse-store-id.js'
import { clearInstagramChatHistory } from '../services/clear-instagram-chat-history.service.js'

/** Owner-only hard delete of Instagram chat history for a store. */
export const clearInstagramChatHistoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

    const storeId = parseStoreIdFromBody(req.body?.storeId ?? req.body?.store_id)
    await storeRepository.assertStoreOwner(storeId, req.authUser.id)

    const result = await clearInstagramChatHistory(storeId)

    res.status(200).json({
      success: true,
      message:
        result.deletedConversations === 0
          ? 'No Instagram chats to delete'
          : 'Instagram chat history deleted',
      data: result,
    })
  }
)

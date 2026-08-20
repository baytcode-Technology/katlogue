import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { parseStoreIdFromBody } from '../../../shared/utils/parse-store-id.js'
import { clearWhatsAppChatHistory } from '../services/clear-whatsapp-chat-history.service.js'

/** Owner-only hard delete of WhatsApp chat history for a store. */
export const clearWhatsAppChatHistoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

    const storeId = parseStoreIdFromBody(req.body?.storeId ?? req.body?.store_id)
    await storeRepository.assertStoreOwner(storeId, req.authUser.id)

    const result = await clearWhatsAppChatHistory(storeId)

    res.status(200).json({
      success: true,
      message:
        result.deletedConversations === 0
          ? 'No WhatsApp chats to delete'
          : 'WhatsApp chat history deleted',
      data: result,
    })
  }
)

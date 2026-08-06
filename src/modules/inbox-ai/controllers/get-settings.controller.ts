import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'

export const getInboxAiSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const { storeId } = req.params as { storeId: string }
  await storeRepository.assertStoreMember(Number(storeId), req.authUser.id)

  const store = await storeRepository.findStoreById(Number(storeId))
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  res.status(200).json({
    success: true,
    message: 'Inbox AI settings fetched',
    data: {
      ai_auto_reply_enabled: store.ai_auto_reply_enabled ?? false,
      ai_system_prompt: store.ai_system_prompt,
      ai_language: store.ai_language,
      premium: hasPremiumAccess(store),
    },
  })
})

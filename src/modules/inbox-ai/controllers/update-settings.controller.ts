import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'

export const updateInboxAiSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const { storeId } = req.params as { storeId: string }
  const body = req.body as {
    ai_auto_reply_enabled?: boolean
    ai_system_prompt?: string | null
    ai_language?: string | null
  }

  await storeRepository.assertStoreMember(Number(storeId), req.authUser.id)

  const existing = await storeRepository.findStoreById(Number(storeId))
  if (!existing) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  if (body.ai_auto_reply_enabled === true && !hasPremiumAccess(existing)) {
    throw new AppError(
      403,
      'Inbox AI auto-reply requires a Business plan',
      'SUBSCRIPTION_REQUIRED'
    )
  }

  const store = await storeRepository.updateStore(Number(storeId), {
    ...(body.ai_auto_reply_enabled !== undefined
      ? { ai_auto_reply_enabled: body.ai_auto_reply_enabled }
      : {}),
    ...(body.ai_system_prompt !== undefined ? { ai_system_prompt: body.ai_system_prompt } : {}),
    ...(body.ai_language !== undefined ? { ai_language: body.ai_language } : {}),
  })

  res.status(200).json({
    success: true,
    message: 'Inbox AI settings updated',
    data: {
      ai_auto_reply_enabled: store.ai_auto_reply_enabled ?? false,
      ai_system_prompt: store.ai_system_prompt,
      ai_language: store.ai_language,
      premium: hasPremiumAccess(store),
    },
  })
})

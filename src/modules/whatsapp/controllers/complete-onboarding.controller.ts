import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { exchangeCodeForAccessToken } from '../services/embedded-signup.service.js'
import { onboardCoexistenceStore } from '../services/onboard-coexistence.service.js'
import type { CompleteOnboardingBody } from '../validations/complete-onboarding.validation.js'

export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as CompleteOnboardingBody
  const { storeId, code, wabaId, phoneNumberId } = body

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  assertPremiumAccess(store)

  const token = await exchangeCodeForAccessToken(code)
  const result = await onboardCoexistenceStore({
    storeId,
    token,
    wabaId,
    phoneNumberId,
  })

  res.status(200).json({
    success: true,
    message: 'WhatsApp connected successfully',
    data: result,
  })
})

import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { exchangeCodeForAccessToken } from '../services/embedded-signup.service.js'
import { consumeEmbeddedSignupSession } from '../services/embedded-signup-session.service.js'
import { onboardCoexistenceStore } from '../services/onboard-coexistence.service.js'
import type { CompleteOnboardingBody } from '../validations/complete-onboarding.validation.js'

export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as CompleteOnboardingBody
  const { storeId, code, state } = body
  let { wabaId, phoneNumberId } = body

  if (!wabaId && state) {
    const session = consumeEmbeddedSignupSession(state)
    if (session) {
      wabaId = session.wabaId
      phoneNumberId = phoneNumberId ?? session.phoneNumberId
    }
  }

  if (!wabaId) {
    throw new AppError(
      400,
      'wabaId is required — complete Embedded Signup in Meta first',
      'EMBEDDED_SIGNUP_ASSETS_REQUIRED'
    )
  }

  console.info('[whatsapp][complete-onboarding] START', {
    storeId,
    wabaId,
    phoneNumberId: phoneNumberId ?? null,
    hasState: Boolean(state),
    codeLength: code?.length ?? 0,
    userId: req.authUser.id,
    configuredRedirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
  })

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

  console.info('[whatsapp][complete-onboarding] SUCCESS', {
    storeId: result.storeId,
    phoneNumberId: result.phoneNumberId,
    wabaId: result.wabaId,
    whatsappNumber: result.whatsappNumber,
    syncTriggered: result.syncTriggered,
  })

  res.status(200).json({
    success: true,
    message: 'WhatsApp connected successfully',
    data: result,
  })
})

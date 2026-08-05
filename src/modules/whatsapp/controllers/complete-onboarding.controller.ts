import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import {
  exchangeCodeForAccessToken,
  fetchWabaFromAccessToken,
} from '../services/embedded-signup.service.js'
import { getEmbeddedSignupSession } from '../services/embedded-signup-session.service.js'
import { onboardCoexistenceStore } from '../services/onboard-coexistence.service.js'
import type { CompleteOnboardingBody } from '../validations/complete-onboarding.validation.js'

export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as CompleteOnboardingBody
  const { storeId, code, state } = body
  let { wabaId, phoneNumberId } = body

  console.info('[whatsapp][complete-onboarding] START', {
    storeId,
    hasWabaId: Boolean(wabaId),
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

  const esSession = getEmbeddedSignupSession(state)
  if (esSession) {
    console.info('[whatsapp][complete-onboarding] ES session before token exchange', {
      storeId,
      eventCount: esSession.events.length,
      events: esSession.events.map((entry) => ({
        type: entry.type,
        event: entry.event,
        at: entry.at,
      })),
      verifyOtpSeen: esSession.verifyOtpSeen,
      onboardingComplete: esSession.onboardingComplete,
      wabaIdFromEs: esSession.wabaId,
      phoneNumberIdFromEs: esSession.phoneNumberId,
      cancelled: esSession.cancelled,
      errored: esSession.errored,
    })

    if (!wabaId && esSession.wabaId) wabaId = esSession.wabaId
    if (!phoneNumberId && esSession.phoneNumberId) phoneNumberId = esSession.phoneNumberId
  } else if (state) {
    console.warn('[whatsapp][complete-onboarding] no ES session events for state', { storeId })
  }

  const token = await exchangeCodeForAccessToken(code)
  console.info('[whatsapp][complete-onboarding] token exchanged', {
    storeId,
    expiresIn: token.expiresIn,
  })

  if (!wabaId) {
    wabaId = await fetchWabaFromAccessToken(token.accessToken)
    console.info('[whatsapp][complete-onboarding] wabaId from debug_token', {
      storeId,
      wabaId: wabaId ?? null,
    })
  }

  if (!wabaId) {
    throw new AppError(
      400,
      'Could not resolve WhatsApp Business Account from Meta token — ensure Embedded Signup completed',
      'EMBEDDED_SIGNUP_ASSETS_REQUIRED'
    )
  }

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

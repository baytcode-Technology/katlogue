import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'
import { resolveStoreWhatsAppCredentials } from '../services/whatsapp.service.js'
import {
  fetchPhoneCoexistenceStatus,
  fetchWabaWebhookSubscription,
  inspectAccessToken,
  resolveWhatsAppWebhookCallbackUrl,
} from '../services/embedded-signup.service.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'
import { env } from '../../../config/env.js'

/** Read-only coexistence diagnostics for debugging smb_app_data 135000. */
export const whatsappSyncDiagnostics = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)
  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const credentials = resolveStoreWhatsAppCredentials(store)
  const expectedCallback = resolveWhatsAppWebhookCallbackUrl()
  const syncJobs = await syncRepository.listSyncJobs(storeId)

  if (!credentials || !store.wa_waba_id) {
    res.status(200).json({
      success: true,
      message: 'WhatsApp not connected',
      data: {
        connected: false,
        expectedWebhookCallback: expectedCallback,
        hasWebhookVerifyToken: Boolean(env.WHATSAPP.WEBHOOK_VERIFY_TOKEN),
        apiPublicUrl: env.API_PUBLIC_URL ?? null,
        syncJobs,
      },
    })
    return
  }

  const phoneStatus = await fetchPhoneCoexistenceStatus({
    phoneNumberId: credentials.phoneNumberId,
    accessToken: credentials.accessToken,
  })

  const webhookSubscription = await fetchWabaWebhookSubscription({
    wabaId: store.wa_waba_id,
    accessToken: credentials.accessToken,
  })

  const tokenInspection = await inspectAccessToken(credentials.accessToken)

  const overrideMatches =
    Boolean(expectedCallback) &&
    webhookSubscription.overrideCallbackUri === expectedCallback

  res.status(200).json({
    success: true,
    message: 'Diagnostics ready',
    data: {
      connected: true,
      storeId,
      wabaId: store.wa_waba_id,
      phoneNumberId: credentials.phoneNumberId,
      whatsappNumber: store.whatsapp_number,
      apiVersion: credentials.apiVersion,
      phoneStatus,
      coexistenceReady:
        phoneStatus.isOnBizApp && phoneStatus.platformType === 'CLOUD_API',
      webhook: {
        expectedCallback,
        overrideCallbackUri: webhookSubscription.overrideCallbackUri,
        overrideMatches,
        hasWebhookVerifyToken: Boolean(env.WHATSAPP.WEBHOOK_VERIFY_TOKEN),
        apiPublicUrl: env.API_PUBLIC_URL ?? null,
      },
      token: {
        isValid: tokenInspection.isValid,
        isExpired: tokenInspection.isExpired,
        expiresAt: tokenInspection.expiresAt,
        scopes: tokenInspection.scopes,
        wabaIds: tokenInspection.wabaIds,
        type: tokenInspection.type,
      },
      syncJobs,
      hints: [
        !expectedCallback
          ? 'Set API_PUBLIC_URL or WHATSAPP_WEBHOOK_CALLBACK_URL on server'
          : null,
        !env.WHATSAPP.WEBHOOK_VERIFY_TOKEN
          ? 'Set WHATSAPP_WEBHOOK_VERIFY_TOKEN on server (required for webhook override)'
          : null,
        !overrideMatches
          ? 'Webhook override not set — tap Retry sync or reconnect'
          : null,
        !tokenInspection.isValid
          ? 'Access token invalid/expired — tap Reconnect account in Connect WhatsApp'
          : null,
        phoneStatus.phoneStatus && phoneStatus.phoneStatus !== 'CONNECTED'
          ? `Phone API status is ${phoneStatus.phoneStatus} (need CONNECTED) — finish coexistence on device`
          : null,
        phoneStatus.codeVerificationStatus === 'NOT_VERIFIED'
          ? 'Phone not verified (code_verification_status=NOT_VERIFIED) — complete verification in WhatsApp Business app'
          : null,
        !phoneStatus.isOnBizApp || phoneStatus.platformType !== 'CLOUD_API'
          ? 'Phone not in coexistence mode — complete Embedded Signup with WhatsApp Business app flow'
          : null,
      ].filter(Boolean),
    },
  })
})

import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as storeNumberRepository from '../repositories/whatsapp-store-number.repository.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'
import {
  exchangeForLongLivedToken,
  fetchPhoneCoexistenceStatus,
  fetchPhoneFromWaba,
  fetchPhoneNumberDetails,
  fetchWabaWebhookSubscription,
  subscribeWhatsAppWebhooksWithOverride,
  type MetaPhoneNumberAsset,
  type MetaTokenExchangeResult,
} from './embedded-signup.service.js'
import { runFullCoexistenceSync } from './coexistence-sync.service.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { env } from '../../../config/env.js'

export type OnboardCoexistenceInput = {
  storeId: number
  token: MetaTokenExchangeResult
  wabaId: string
  phoneNumberId?: string | null
}

export type OnboardCoexistenceResult = {
  storeId: number
  phoneNumberId: string | null
  wabaId: string | null
  whatsappNumber: string | null
  syncTriggered: boolean
}

async function resolvePhoneAsset(input: {
  wabaId: string
  phoneNumberId?: string | null
  accessToken: string
}): Promise<MetaPhoneNumberAsset | null> {
  const wabaId = input.wabaId.trim()
  if (!wabaId) return null

  if (input.phoneNumberId?.trim()) {
    const details = await fetchPhoneNumberDetails({
      phoneNumberId: input.phoneNumberId.trim(),
      accessToken: input.accessToken,
      wabaId,
    })
    if (details) return details

    return {
      phoneNumberId: input.phoneNumberId.trim(),
      displayPhoneNumber: null,
      wabaId,
      verifiedName: null,
    }
  }

  return fetchPhoneFromWaba({ wabaId, accessToken: input.accessToken })
}

export async function onboardCoexistenceStore(
  input: OnboardCoexistenceInput
): Promise<OnboardCoexistenceResult> {
  const wabaId = input.wabaId?.trim()
  if (!wabaId) {
    throw new AppError(
      400,
      'wabaId is required from Embedded Signup session',
      'EMBEDDED_SIGNUP_ASSETS_REQUIRED'
    )
  }

  const existingStore = await storeRepository.findStoreById(input.storeId)
  if (!existingStore) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }
  assertPremiumAccess(existingStore)

  let accessToken = input.token.accessToken

  const phoneAsset = await resolvePhoneAsset({
    wabaId,
    phoneNumberId: input.phoneNumberId,
    accessToken,
  })

  if (!phoneAsset?.phoneNumberId) {
    throw new AppError(
      400,
      'Could not resolve WhatsApp phone number from Embedded Signup assets',
      'EMBEDDED_SIGNUP_PHONE_NOT_FOUND'
    )
  }

  const coexistenceStatus = await fetchPhoneCoexistenceStatus({
    phoneNumberId: phoneAsset.phoneNumberId,
    accessToken,
  })
  console.info('[coexistence] phone readiness', {
    storeId: input.storeId,
    phoneNumberId: phoneAsset.phoneNumberId,
    ...coexistenceStatus,
  })

  let webhookOverrideApplied = false
  try {
    const webhookResult = await subscribeWhatsAppWebhooksWithOverride({
      wabaId,
      accessToken,
    })
    webhookOverrideApplied = webhookResult.overrideApplied
    const subscription = await fetchWabaWebhookSubscription({ wabaId, accessToken })
    console.info('[coexistence] webhook subscription state', {
      storeId: input.storeId,
      wabaId,
      overrideApplied: webhookOverrideApplied,
      overrideCallbackUri: subscription.overrideCallbackUri,
    })
  } catch (err) {
    console.error('[coexistence] webhook subscribe/override failed', err)
  }

  let syncTriggered = false
  const credentialsForSync = {
    accessToken,
    phoneNumberId: phoneAsset.phoneNumberId,
    apiVersion: env.WHATSAPP.API_VERSION,
  }

  if (coexistenceStatus.isOnBizApp && coexistenceStatus.platformType === 'CLOUD_API') {
    try {
      const syncResult = await runFullCoexistenceSync({
        storeId: input.storeId,
        credentials: credentialsForSync,
        initialDelayMs: 3_000,
        wabaId,
      })
      syncTriggered = Boolean(syncResult.contacts)
      if (syncResult.historySkipped) {
        console.warn('[coexistence] contacts sync started; history sync deferred/failed', {
          storeId: input.storeId,
        })
      }
    } catch (err) {
      console.error('[coexistence] sync trigger failed', err)
    }
  } else {
    console.warn('[coexistence] skipping smb_app_data — phone not coexistence-ready', {
      storeId: input.storeId,
      ...coexistenceStatus,
    })
  }

  try {
    const longLived = await exchangeForLongLivedToken(accessToken)
    accessToken = longLived.accessToken
  } catch {
    // Keep short-lived token if exchange fails (dev/test)
  }

  const store = await storeRepository.updateWhatsAppConnection({
    storeId: input.storeId,
    waPhoneNumberId: phoneAsset.phoneNumberId,
    waWabaId: phoneAsset.wabaId ?? wabaId,
    waAccessToken: accessToken,
    whatsappNumber: phoneAsset.displayPhoneNumber ?? undefined,
  })

  await storeNumberRepository.upsertStoreNumber({
    storeId: input.storeId,
    waPhoneNumberId: phoneAsset.phoneNumberId,
    waBusinessAccountId: phoneAsset.wabaId ?? wabaId,
  })

  return {
    storeId: input.storeId,
    phoneNumberId: phoneAsset.phoneNumberId,
    wabaId: phoneAsset.wabaId ?? wabaId,
    whatsappNumber: phoneAsset.displayPhoneNumber,
    syncTriggered,
  }
}

export async function getConnectionStatus(storeId: number) {
  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const hasToken = Boolean(store.wa_access_token)
  const hasPhone = Boolean(store.wa_phone_number_id)
  const connected = hasToken && hasPhone

  let isOnBizApp = false
  let platformType: string | null = null
  let codeVerificationStatus: string | null = null
  let phoneStatus: string | null = null

  if (connected) {
    const status = await fetchPhoneCoexistenceStatus({
      phoneNumberId: store.wa_phone_number_id!,
      accessToken: store.wa_access_token!,
    })
    isOnBizApp = status.isOnBizApp
    platformType = status.platformType
    codeVerificationStatus = status.codeVerificationStatus
    phoneStatus = status.phoneStatus
  }

  const syncJobs = await syncRepository.listSyncJobs(storeId)

  const allSyncComplete =
    syncJobs.length > 0 &&
    syncJobs.every((j) => ['completed', 'declined', 'failed'].includes(j.status))

  return {
    connected,
    is_on_biz_app: isOnBizApp,
    platform_type: platformType,
    code_verification_status: codeVerificationStatus,
    phone_status: phoneStatus,
    wa_phone_number_id: store.wa_phone_number_id,
    wa_waba_id: store.wa_waba_id,
    whatsapp_number: store.whatsapp_number,
    sync_jobs: syncJobs,
    sync_complete: connected ? allSyncComplete : true,
  }
}

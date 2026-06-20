import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as storeNumberRepository from '../repositories/whatsapp-store-number.repository.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'
import {
  exchangeForLongLivedToken,
  fetchConnectedPhoneNumber,
  fetchPhoneCoexistenceStatus,
  type MetaTokenExchangeResult,
} from './embedded-signup.service.js'
import { runFullCoexistenceSync } from './coexistence-sync.service.js'
import { resolveStoreWhatsAppCredentials } from './whatsapp.service.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'

export type OnboardCoexistenceInput = {
  storeId: number
  token: MetaTokenExchangeResult
}

export type OnboardCoexistenceResult = {
  storeId: number
  phoneNumberId: string | null
  wabaId: string | null
  whatsappNumber: string | null
  syncTriggered: boolean
}

export async function onboardCoexistenceStore(
  input: OnboardCoexistenceInput
): Promise<OnboardCoexistenceResult> {
  let accessToken = input.token.accessToken

  try {
    const longLived = await exchangeForLongLivedToken(accessToken)
    accessToken = longLived.accessToken
  } catch {
    // Keep short-lived token if exchange fails (dev/test)
  }

  const phoneAsset = await fetchConnectedPhoneNumber(accessToken)

  const existingStore = await storeRepository.findStoreById(input.storeId)
  if (!existingStore) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }
  assertPremiumAccess(existingStore)

  const store = await storeRepository.updateWhatsAppConnection({
    storeId: input.storeId,
    waPhoneNumberId: phoneAsset?.phoneNumberId ?? null,
    waWabaId: phoneAsset?.wabaId ?? null,
    waAccessToken: accessToken,
    whatsappNumber: phoneAsset?.displayPhoneNumber ?? undefined,
  })

  if (phoneAsset?.phoneNumberId) {
    await storeNumberRepository.upsertStoreNumber({
      storeId: input.storeId,
      waPhoneNumberId: phoneAsset.phoneNumberId,
      waBusinessAccountId: phoneAsset.wabaId,
    })
  }

  let syncTriggered = false
  const credentials = resolveStoreWhatsAppCredentials(store)

  if (credentials) {
    try {
      await runFullCoexistenceSync({ storeId: input.storeId, credentials })
      syncTriggered = true
    } catch (err) {
      console.error('[coexistence] sync trigger failed', err)
    }
  }

  return {
    storeId: input.storeId,
    phoneNumberId: phoneAsset?.phoneNumberId ?? null,
    wabaId: phoneAsset?.wabaId ?? null,
    whatsappNumber: phoneAsset?.displayPhoneNumber ?? null,
    syncTriggered,
  }
}

export async function getConnectionStatus(storeId: number) {
  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const hasToken = Boolean(store.wa_access_token)
  const hasPhone = Boolean(store.wa_phone_number_id)

  let isOnBizApp = false
  let platformType: string | null = null

  if (hasToken && hasPhone) {
    const status = await fetchPhoneCoexistenceStatus({
      phoneNumberId: store.wa_phone_number_id!,
      accessToken: store.wa_access_token!,
    })
    isOnBizApp = status.isOnBizApp
    platformType = status.platformType
  }

  const syncJobs = await syncRepository.listSyncJobs(storeId)

  const allSyncComplete =
    syncJobs.length > 0 &&
    syncJobs.every((j) => ['completed', 'declined', 'failed'].includes(j.status))

  return {
    connected: hasToken && hasPhone,
    is_on_biz_app: isOnBizApp,
    platform_type: platformType,
    wa_phone_number_id: store.wa_phone_number_id,
    wa_waba_id: store.wa_waba_id,
    whatsapp_number: store.whatsapp_number,
    sync_jobs: syncJobs,
    sync_complete: allSyncComplete || syncJobs.length === 0,
  }
}

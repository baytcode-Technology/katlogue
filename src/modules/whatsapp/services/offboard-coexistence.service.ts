import axios from 'axios'

import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { deleteStoreNumbersForStore } from '../repositories/whatsapp-store-number.repository.js'
import { deleteSyncJobsForStore } from '../repositories/whatsapp-sync.repository.js'

export type OffboardWhatsAppResult = {
  storeId: number
  wabaId: string | null
  phoneNumberId: string | null
  metaUnsubscribed: boolean
  metaUnsubscribeError: string | null
  localCredentialsCleared: boolean
  syncJobsCleared: boolean
  merchantSteps: string[]
}

/** Remove our app subscription from the merchant WABA (Graph API offboarding). */
async function unsubscribeWhatsAppFromWaba(input: {
  wabaId: string
  accessToken: string
}): Promise<void> {
  await axios.delete(
    `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${input.wabaId}/subscribed_apps`,
    {
      params: { access_token: input.accessToken },
      timeout: 15_000,
    }
  )
}

/**
 * Server-side offboard for coexistence re-onboarding.
 * Meta does not expose a deregister API for coexistence numbers — merchant must also
 * disconnect in WhatsApp Business app (Settings → Account → Business Platform).
 */
export async function offboardWhatsAppStore(input: {
  storeId: number
  wabaId?: string | null
  phoneNumberId?: string | null
}): Promise<OffboardWhatsAppResult> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const wabaId = (input.wabaId ?? store.wa_waba_id)?.trim() || null
  const phoneNumberId = (input.phoneNumberId ?? store.wa_phone_number_id)?.trim() || null
  const accessToken = store.wa_access_token?.trim() || null

  let metaUnsubscribed = false
  let metaUnsubscribeError: string | null = null

  if (wabaId && accessToken) {
    try {
      await unsubscribeWhatsAppFromWaba({ wabaId, accessToken })
      metaUnsubscribed = true
      console.info('[whatsapp][offboard] subscribed_apps removed', {
        storeId: input.storeId,
        wabaId,
      })
    } catch (err) {
      metaUnsubscribeError = err instanceof Error ? err.message : 'unknown error'
      console.warn('[whatsapp][offboard] subscribed_apps removal failed', {
        storeId: input.storeId,
        wabaId,
        error: metaUnsubscribeError,
      })
    }
  } else {
    metaUnsubscribeError = !wabaId
      ? 'No WABA id on store — skipped Meta unsubscribe'
      : 'No access token on store — skipped Meta unsubscribe'
  }

  await storeRepository.updateWhatsAppConnection({
    storeId: input.storeId,
    waPhoneNumberId: null,
    waWabaId: null,
    waAccessToken: null,
    whatsappNumber: null,
  })

  await deleteStoreNumbersForStore(input.storeId)
  await deleteSyncJobsForStore(input.storeId)

  const merchantSteps = [
    'On the phone, open WhatsApp Business → Settings → Account → Business Platform → Disconnect from BaytCode / AiShopy.',
    'Wait ~1 minute, then tap Connect WhatsApp again to run Embedded Signup from scratch (OTP should appear).',
  ]

  return {
    storeId: input.storeId,
    wabaId,
    phoneNumberId,
    metaUnsubscribed,
    metaUnsubscribeError,
    localCredentialsCleared: true,
    syncJobsCleared: true,
    merchantSteps,
  }
}

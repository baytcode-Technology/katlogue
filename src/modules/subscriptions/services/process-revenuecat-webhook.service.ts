import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as checkoutRepository from '../repositories/subscription-checkout.repository.js'
import * as revenuecatRepository from '../repositories/revenuecat.repository.js'
import {
  formatSubscriptionDateOnly,
  normalizeSubscriptionDate,
} from '../../../shared/lib/subscription.js'
import { AppError } from '../../../shared/errors/app.error.js'

const BUSINESS_PRODUCT_IDS = new Set(['aishopy_business_monthly'])
const BUSINESS_ENTITLEMENT = 'business'

export type RevenueCatWebhookPayload = {
  api_version?: string
  event: {
    id: string
    type: string
    app_user_id: string
    product_id?: string | null
    entitlement_ids?: string[] | null
    entitlement_id?: string | null
    expiration_at_ms?: number | null
    purchased_at_ms?: number | null
    price?: number | null
    currency?: string | null
    environment?: string | null
    store?: string | null
    original_transaction_id?: string | null
    transaction_id?: string | null
    subscriber_attributes?: Record<string, { value?: string | null } | undefined>
  }
}

function expiresAtFromMs(expirationAtMs: number | null | undefined): string {
  if (expirationAtMs && Number.isFinite(expirationAtMs)) {
    return formatSubscriptionDateOnly(new Date(expirationAtMs))
  }
  // Fallback: one month from today (should be rare)
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + 1)
  return formatSubscriptionDateOnly(d)
}

function isBusinessEntitlement(event: RevenueCatWebhookPayload['event']): boolean {
  if (event.product_id && BUSINESS_PRODUCT_IDS.has(event.product_id)) return true
  if (event.entitlement_id === BUSINESS_ENTITLEMENT) return true
  if (event.entitlement_ids?.includes(BUSINESS_ENTITLEMENT)) return true
  return false
}

function storeIdFromAttributes(
  attrs: RevenueCatWebhookPayload['event']['subscriber_attributes']
): number | null {
  const raw = attrs?.store_id?.value ?? attrs?.$storeId?.value
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function resolveStoreForOwner(ownerId: string, preferredStoreId: number | null) {
  if (preferredStoreId) {
    try {
      return await storeStaffRepository.resolveOwnedStore(ownerId, preferredStoreId)
    } catch {
      // Fall through to primary owned store
    }
  }
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found for subscriber', 'STORE_NOT_FOUND')
  }
  return store
}

export async function processRevenueCatWebhook(
  payload: RevenueCatWebhookPayload,
  authHeader: string | undefined
): Promise<void> {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH?.trim()
  if (!expected) {
    throw new AppError(500, 'RevenueCat webhook is not configured', 'REVENUECAT_NOT_CONFIGURED')
  }

  const provided = authHeader?.trim() ?? ''
  if (provided !== expected && provided !== `Bearer ${expected}`) {
    throw new AppError(401, 'Invalid RevenueCat webhook authorization', 'UNAUTHORIZED')
  }

  const event = payload.event
  if (!event?.id || !event.type || !event.app_user_id) {
    throw new AppError(400, 'Invalid RevenueCat webhook payload', 'INVALID_WEBHOOK')
  }

  if (await revenuecatRepository.findProcessedRevenueCatEvent(event.id)) {
    return
  }

  if (!isBusinessEntitlement(event)) {
    await revenuecatRepository.markRevenueCatEventProcessed({
      eventId: event.id,
      eventType: event.type,
      appUserId: event.app_user_id,
    })
    return
  }

  const preferredStoreId = storeIdFromAttributes(event.subscriber_attributes)
  const store = await resolveStoreForOwner(event.app_user_id, preferredStoreId)
  const paidAt = event.purchased_at_ms
    ? new Date(event.purchased_at_ms).toISOString()
    : new Date().toISOString()

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE': {
      const expiresAt = expiresAtFromMs(event.expiration_at_ms)
      const providerOrderId =
        event.original_transaction_id || event.transaction_id || event.id
      const providerPaymentId = event.transaction_id || event.id

      const existing = await checkoutRepository.findCheckoutByProviderOrderId(providerOrderId)
      if (!existing) {
        const checkout = await revenuecatRepository.insertCheckoutWithProvider({
          store_id: store.id,
          owner_id: event.app_user_id,
          provider: 'revenuecat',
          provider_order_id: providerOrderId,
          amount: event.price ?? 0,
          currency: event.currency ?? 'USD',
          plan: 'business',
        })
        await checkoutRepository.updateCheckout(checkout.id, {
          status: 'paid',
          provider_payment_id: providerPaymentId,
          paid_at: paidAt,
          period_expires_at: expiresAt,
        })
      } else {
        await checkoutRepository.updateCheckout(existing.id, {
          status: 'paid',
          provider_payment_id: providerPaymentId,
          paid_at: paidAt,
          period_expires_at: expiresAt,
        })
      }

      await storeRepository.activateBusinessSubscription(store.id, expiresAt)
      break
    }
    case 'EXPIRATION':
    case 'REFUND': {
      await storeRepository.downgradeStoreToStarter(store.id)
      break
    }
    case 'CANCELLATION':
      // Access continues until expiration_at_ms; EXPIRATION webhook revokes later.
      if (event.expiration_at_ms) {
        const expiresAt = normalizeSubscriptionDate(expiresAtFromMs(event.expiration_at_ms))
        await storeRepository.activateBusinessSubscription(store.id, expiresAt)
      }
      break
    default:
      break
  }

  await revenuecatRepository.markRevenueCatEventProcessed({
    eventId: event.id,
    eventType: event.type,
    appUserId: event.app_user_id,
    storeId: store.id,
  })
}

import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { formatSubscriptionDateOnly } from '../../../shared/lib/subscription.js'
import { AppError } from '../../../shared/errors/app.error.js'

const BUSINESS_ENTITLEMENT = 'business'
const BUSINESS_PRODUCT_ID = 'aishopy_business_monthly'

type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null
        product_identifier?: string | null
        purchase_date?: string | null
      }
    >
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null
        purchase_date?: string | null
      }
    >
  }
}

export async function syncAppleSubscriptionFromRevenueCat(input: {
  ownerId: string
  storeId: number
}) {
  const secret = process.env.REVENUECAT_SECRET_API_KEY?.trim()
  if (!secret) {
    throw new AppError(500, 'RevenueCat API is not configured', 'REVENUECAT_NOT_CONFIGURED')
  }

  const store = await storeStaffRepository.resolveOwnedStore(input.ownerId, input.storeId)

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(input.ownerId)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AppError(
      502,
      text || 'Failed to fetch RevenueCat subscriber',
      'REVENUECAT_LOOKUP_FAILED'
    )
  }

  const body = (await res.json()) as RevenueCatSubscriberResponse
  const entitlement = body.subscriber?.entitlements?.[BUSINESS_ENTITLEMENT]
  const subscription =
    body.subscriber?.subscriptions?.[BUSINESS_PRODUCT_ID] ??
    (entitlement?.product_identifier
      ? body.subscriber?.subscriptions?.[entitlement.product_identifier]
      : undefined)

  const expiresRaw = entitlement?.expires_date ?? subscription?.expires_date
  if (!expiresRaw) {
    return {
      store,
      active: false,
      subscription_plan: store.subscription_plan,
      subscription_expires_at: store.subscription_expires_at,
    }
  }

  const expiresMs = Date.parse(expiresRaw)
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    const downgraded = await storeRepository.downgradeStoreToStarter(store.id)
    return {
      store: downgraded,
      active: false,
      subscription_plan: downgraded.subscription_plan,
      subscription_expires_at: downgraded.subscription_expires_at,
    }
  }

  const expiresAt = formatSubscriptionDateOnly(new Date(expiresMs))
  const updated = await storeRepository.activateBusinessSubscription(store.id, expiresAt)
  return {
    store: updated,
    active: true,
    subscription_plan: updated.subscription_plan,
    subscription_expires_at: updated.subscription_expires_at,
  }
}

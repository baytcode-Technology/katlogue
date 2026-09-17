import { maskSecret } from '../../../shared/lib/payment-encryption.js'
import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import {
  buildSubdomainUrl,
  getPublicStorefrontBaseDomain,
} from '../../../shared/utils/storefront.js'
import { parseStoredPaymentConfig } from '../../payments/lib/payment-config.js'
import type { SubscriptionCheckout } from '../../subscriptions/types/subscription-checkout.types.js'
import type { Store } from '../../stores/types/store.types.js'
import type {
  AdminPlanFilter,
  AdminStorePlan,
  PlatformAdminCheckoutSummary,
  PlatformAdminPaymentSummary,
  PlatformAdminStoreSummary,
  PlatformAdminUserCard,
} from '../types/platform-admin-users.types.js'

export type AuthUserRow = {
  id: string
  email?: string
  phone?: string
  created_at: string
  last_sign_in_at?: string
  identities?: Array<{ provider?: string }>
  app_metadata?: { provider?: string; providers?: string[] }
}

const PLAN_RANK: Record<AdminStorePlan, number> = {
  starter: 1,
  business: 2,
  enterprise: 3,
}

export function normalizePlanFilter(plan?: AdminPlanFilter): AdminStorePlan | undefined {
  if (!plan) return undefined
  if (plan === 'free') return 'starter'
  return plan
}

export function rollupPlan(stores: Pick<Store, 'subscription_plan'>[]): AdminStorePlan | null {
  if (stores.length === 0) return null
  return stores.reduce<AdminStorePlan>((best, store) => {
    const plan = store.subscription_plan
    return PLAN_RANK[plan] > PLAN_RANK[best] ? plan : best
  }, 'starter')
}

export function toPaymentSummary(store: Store): PlatformAdminPaymentSummary {
  const stored = parseStoredPaymentConfig(store.payment_config)
  return {
    store_id: store.id,
    cod_enabled: stored.cod?.enabled ?? true,
    razorpay_enabled: stored.razorpay?.enabled ?? false,
    razorpay_configured: Boolean(stored.razorpay?.key_id && stored.razorpay?.key_secret_encrypted),
    razorpay_mode: stored.razorpay?.mode === 'live' ? 'live' : 'test',
    razorpay_key_id_masked: maskSecret(stored.razorpay?.key_id),
    upi_enabled: Boolean(stored.upi?.enabled && stored.upi?.vpa),
    upi_vpa_masked: maskSecret(stored.upi?.vpa),
  }
}

export function toStoreSummary(store: Store): PlatformAdminStoreSummary {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logo_url: store.logo_url,
    phone: store.whatsapp_number,
    country: store.country,
    currency: store.currency,
    timezone: store.timezone,
    industry: store.industry,
    is_active: store.is_active,
    created_at: store.created_at,
    subscription_plan: store.subscription_plan,
    subscription_expires_at: store.subscription_expires_at,
    premium_active: hasPremiumAccess(store),
    product_count: store.product_count,
    order_count: store.order_count,
    ai_auto_reply_enabled: store.ai_auto_reply_enabled,
    ai_third_party_consent_at: store.ai_third_party_consent_at,
    whatsapp_connected: Boolean(store.wa_phone_number_id),
    instagram_connected: Boolean(store.ig_user_id),
    instagram_username: store.ig_username,
    storefront_url: buildSubdomainUrl(store.slug, getPublicStorefrontBaseDomain()),
    payments: toPaymentSummary(store),
  }
}

export function toCheckoutSummary(row: SubscriptionCheckout): PlatformAdminCheckoutSummary {
  return {
    id: row.id,
    store_id: row.store_id,
    plan: row.plan,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    paid_at: row.paid_at,
    period_expires_at: row.period_expires_at,
    created_at: row.created_at,
  }
}

export function authProviders(user: AuthUserRow): string[] {
  const fromIdentities = (user.identities ?? [])
    .map((identity) => identity.provider)
    .filter((provider): provider is string => Boolean(provider))
  if (fromIdentities.length > 0) {
    return [...new Set(fromIdentities)]
  }
  const meta = user.app_metadata?.providers
  if (meta && meta.length > 0) return [...new Set(meta)]
  if (user.app_metadata?.provider) return [user.app_metadata.provider]
  return []
}

export function toUserCard(user: AuthUserRow, stores: Store[]): PlatformAdminUserCard {
  const sorted = [...stores].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const primary = sorted[0] ?? null
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone || null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    has_store: stores.length > 0,
    store_count: stores.length,
    primary_store_name: primary?.name ?? null,
    primary_store_phone: primary?.whatsapp_number ?? null,
    rollup_plan: rollupPlan(stores),
    premium_active: stores.some((store) => hasPremiumAccess(store)),
  }
}

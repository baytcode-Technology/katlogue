import type { PublicPaymentMethods } from '../../payments/types/payment-config.types.js'
import { parseStoredPaymentConfig, toPublicPaymentMethods } from '../../payments/lib/payment-config.js'
import type { Store, ThemeConfig } from '../../stores/types/store.types.js'
import { parseStoredNotificationPreferences } from '../../notifications/lib/notification-preferences.js'
import type { StoredNotificationPreferences } from '../../notifications/types/notification.types.js'

/** Store fields safe to expose on the public storefront (no secrets). */
export type PublicStore = Omit<Store, 'wa_access_token' | 'payment_config'> & {
  payment_methods: PublicPaymentMethods
}

/** Whitelisted fields returned by GET /api/public/store. */
export type PublicStoreResponse = {
  id: number
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  whatsapp_number: string
  currency: string
  timezone: string
  is_active: boolean
  industry: string | null
  country: string
  notification_preferences: StoredNotificationPreferences
  payment_methods: PublicPaymentMethods
  theme_config: ThemeConfig | null
}

export function toPublicStore(store: Store): PublicStore {
  const { wa_access_token: _removed, payment_config, ...rest } = store
  const stored = parseStoredPaymentConfig(payment_config)
  return {
    ...rest,
    payment_methods: toPublicPaymentMethods(stored),
  }
}

export function toPublicStoreResponse(store: PublicStore): PublicStoreResponse {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description,
    logo_url: store.logo_url,
    whatsapp_number: store.whatsapp_number,
    currency: store.currency,
    timezone: store.timezone,
    is_active: store.is_active,
    industry: store.industry,
    country: store.country,
    notification_preferences: parseStoredNotificationPreferences(store.notification_preferences),
    payment_methods: store.payment_methods,
    theme_config: store.theme_config ?? null,
  }
}

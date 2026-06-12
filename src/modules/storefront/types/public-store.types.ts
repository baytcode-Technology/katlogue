import type { PublicPaymentMethods } from '../../payments/types/payment-config.types.js'
import { parseStoredPaymentConfig, toPublicPaymentMethods } from '../../payments/lib/payment-config.js'
import type { Store } from '../../stores/types/store.types.js'

/** Store fields safe to expose on the public storefront (no secrets). */
export type PublicStore = Omit<Store, 'wa_access_token' | 'payment_config'> & {
  payment_methods: PublicPaymentMethods
}

export function toPublicStore(store: Store): PublicStore {
  const { wa_access_token: _removed, payment_config, ...rest } = store
  const stored = parseStoredPaymentConfig(payment_config)
  return {
    ...rest,
    payment_methods: toPublicPaymentMethods(stored),
  }
}

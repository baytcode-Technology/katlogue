import type { Store } from '../../stores/types/store.types.js'

/** Store fields safe to expose on the public storefront (no secrets). */
export type PublicStore = Omit<Store, 'wa_access_token'>

export function toPublicStore(store: Store): PublicStore {
  const { wa_access_token: _removed, ...publicStore } = store
  return publicStore
}

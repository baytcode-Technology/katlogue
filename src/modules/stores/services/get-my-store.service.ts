import * as storeStaffRepository from '../repositories/store-staff.repository.js'
import type { MyStoreResult } from '../types/store.types.js'

export async function getMyStore(
  userId: string,
  preferredStoreId?: number
): Promise<MyStoreResult> {
  if (preferredStoreId != null && Number.isFinite(preferredStoreId)) {
    const match = await storeStaffRepository.findStoreByIdForUser(
      preferredStoreId,
      userId
    )
    if (match) {
      return {
        hasStore: true,
        store: match.store,
        role: match.role,
      }
    }
  }

  const all = await storeStaffRepository.findStoresForUser(userId)
  if (all.length === 0) {
    return { hasStore: false, store: null, role: null }
  }

  const firstOwned = all.find((item) => item.role === 'owner')
  const pick = firstOwned ?? all[0]

  return {
    hasStore: true,
    store: pick.store,
    role: pick.role,
  }
}

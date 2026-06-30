import { AppError } from '../../../shared/errors/app.error.js'
import * as storeStaffRepository from '../repositories/store-staff.repository.js'
import * as storeRepository from '../repositories/store.repository.js'
import type { Store, UpdateStoreInput } from '../types/store.types.js'

export async function updateMyStore(
  ownerId: string,
  storeId: number,
  input: UpdateStoreInput
): Promise<Store> {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)
  await storeRepository.assertStoreOwner(store.id, ownerId)
  return storeRepository.updateStore(store.id, input)
}

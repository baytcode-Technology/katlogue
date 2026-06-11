import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../repositories/store.repository.js'
import type { Store, UpdateStoreInput } from '../types/store.types.js'

export async function updateMyStore(
  ownerId: string,
  input: UpdateStoreInput
): Promise<Store> {
  const existing = await storeRepository.findStoreByOwnerId(ownerId)

  if (!existing) {
    throw new AppError(404, 'No store found for this account', 'STORE_NOT_FOUND')
  }

  await storeRepository.assertStoreOwner(existing.id, ownerId)

  return storeRepository.updateStore(existing.id, input)
}

import * as storeRepository from '../repositories/store.repository.js'
import type { MyStoreResult } from '../types/store.types.js'

export async function getMyStore(ownerId: string): Promise<MyStoreResult> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)

  return {
    hasStore: store !== null,
    store,
  }
}

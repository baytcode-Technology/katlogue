import * as storeRepository from '../repositories/store.repository.js'
import type { CreateStoreInput, Store } from '../types/store.types.js'

export async function createStore(
  ownerId: string,
  input: CreateStoreInput
): Promise<Store> {
  return storeRepository.insertStore(ownerId, {
    ...input,
    description: input.description?.trim() || null,
  })
}

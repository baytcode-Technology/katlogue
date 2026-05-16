import { assertStoreOwner } from '../../stores/repositories/store.repository.js'
import * as categoryRepository from '../repositories/category.repository.js'
import type { Category } from '../types/category.types.js'

export async function listCategoriesByStore(
  ownerId: string,
  storeId: string
): Promise<Category[]> {
  await assertStoreOwner(storeId, ownerId)
  return categoryRepository.findCategoriesByStoreId(storeId)
}

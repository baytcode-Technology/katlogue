import * as productRepository from '../repositories/product.repository.js'
import type { Product } from '../types/product.types.js'

export async function listProductsByStore(
  ownerId: string,
  storeId: number
): Promise<Product[]> {
  await productRepository.assertStoreOwner(storeId, ownerId)
  return productRepository.findProductsByStoreId(storeId)
}

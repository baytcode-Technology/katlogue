import * as productRepository from '../../products/repositories/product.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'

export async function syncCategoryProducts(
  ownerId: string,
  categoryId: number,
  storeId: number,
  productIds: number[]
): Promise<{ assigned: number; removed: number }> {
  await productRepository.assertStoreOwner(storeId, ownerId)
  await productRepository.assertCategoryBelongsToStore(categoryId, storeId)

  const uniqueIds = [...new Set(productIds)]
  if (uniqueIds.length > 0) {
    const valid = await productRepository.findProductsByIds(storeId, uniqueIds)
    if (valid.length !== uniqueIds.length) {
      throw new AppError(400, 'One or more products are invalid for this store', 'INVALID_PRODUCT')
    }
  }

  return productRepository.syncCategoryMembership(storeId, categoryId, uniqueIds)
}

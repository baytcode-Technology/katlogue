import * as productRepository from '../repositories/product.repository.js'
import * as variantRepository from '../repositories/product-variant.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  assertWithinProductLimit,
  hasPremiumAccess,
} from '../../../shared/lib/subscription.js'
import type { CreateProductInput, CreateProductResult } from '../types/product.types.js'

export async function createProduct(
  ownerId: string,
  input: CreateProductInput
): Promise<CreateProductResult> {
  await productRepository.assertStoreOwner(input.store_id, ownerId)

  const store = await storeRepository.findStoreById(input.store_id)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  if (!hasPremiumAccess(store)) {
    const productCount = await productRepository.countByStoreId(input.store_id)
    assertWithinProductLimit(productCount)
  }

  if (input.category_id) {
    await productRepository.assertCategoryBelongsToStore(
      input.category_id,
      input.store_id
    )
  }

  const product = await productRepository.insertProduct(input)
  const variants = await variantRepository.insertVariants(
    product.id,
    input.variants ?? []
  )

  await storeRepository.incrementProductCount(input.store_id)

  return { product, variants }
}

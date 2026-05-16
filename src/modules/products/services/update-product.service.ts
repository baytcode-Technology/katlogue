import { AppError } from '../../../shared/errors/app.error.js'
import * as productRepository from '../repositories/product.repository.js'
import type { Product, UpdateProductInput } from '../types/product.types.js'

export async function updateProduct(
  ownerId: string,
  productId: string,
  input: UpdateProductInput
): Promise<Product> {
  const existing = await productRepository.findProductById(productId)

  if (!existing) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
  }

  await productRepository.assertStoreOwner(existing.store_id, ownerId)

  if (input.category_id) {
    await productRepository.assertCategoryBelongsToStore(
      input.category_id,
      existing.store_id
    )
  }

  return productRepository.updateProduct(productId, input)
}

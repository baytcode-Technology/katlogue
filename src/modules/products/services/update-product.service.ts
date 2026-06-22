import { AppError } from '../../../shared/errors/app.error.js'
import * as productRepository from '../repositories/product.repository.js'
import * as variantRepository from '../repositories/product-variant.repository.js'
import type { Product, UpdateProductInput } from '../types/product.types.js'

export async function updateProduct(
  ownerId: string,
  productId: number,
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

  const variants = await variantRepository.findVariantsByProductId(productId)
  const patch =
    variants.length > 0
      ? { ...input, mark_as_sold: false, mark_as_non_inventory: false }
      : input

  return productRepository.updateProduct(productId, patch)
}

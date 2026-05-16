import * as productRepository from '../repositories/product.repository.js'
import type { CreateProductInput, Product } from '../types/product.types.js'

export async function createProduct(
  ownerId: string,
  input: CreateProductInput
): Promise<Product> {
  await productRepository.assertStoreOwner(input.store_id, ownerId)

  if (input.category_id) {
    await productRepository.assertCategoryBelongsToStore(
      input.category_id,
      input.store_id
    )
  }

  return productRepository.insertProduct(input)
}

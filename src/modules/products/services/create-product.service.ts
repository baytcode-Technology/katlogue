import * as productRepository from '../repositories/product.repository.js'
import * as variantRepository from '../repositories/product-variant.repository.js'
import type { CreateProductInput, CreateProductResult } from '../types/product.types.js'

export async function createProduct(
  ownerId: string,
  input: CreateProductInput
): Promise<CreateProductResult> {
  await productRepository.assertStoreOwner(input.store_id, ownerId)

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

  return { product, variants }
}

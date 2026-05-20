import * as productRepository from '../repositories/product.repository.js'
import * as variantRepository from '../repositories/product-variant.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Product } from '../types/product.types.js'
import type { ProductVariant } from '../types/product-variant.types.js'

export type GetProductResult = {
  product: Product
  variants: ProductVariant[]
}

export async function getProductById(
  ownerId: string,
  productId: string
): Promise<GetProductResult> {
  const product = await productRepository.findProductById(productId)
  if (!product) {
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
  }

  await productRepository.assertStoreOwner(product.store_id, ownerId)
  const variants = await variantRepository.findVariantsByProductId(productId)

  return { product, variants }
}

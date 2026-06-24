import * as productRepository from '../repositories/product.repository.js'

import * as variantRepository from '../repositories/product-variant.repository.js'

import { AppError } from '../../../shared/errors/app.error.js'

import type { CreateProductVariantInput, ProductVariant, UpdateProductVariantInput } from '../types/product-variant.types.js'



async function assertProductAccess(ownerId: string, productId: number) {

  const product = await productRepository.findProductById(productId)

  if (!product) {

    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')

  }

  await productRepository.assertStoreOwner(product.store_id, ownerId)

  return product

}



export async function createVariant(

  ownerId: string,

  productId: number,

  input: CreateProductVariantInput

): Promise<ProductVariant> {

  const product = await assertProductAccess(ownerId, productId)

  const existingVariants = await variantRepository.findVariantsByProductId(productId)

  const variant = await variantRepository.insertVariant(productId, input)



  const patch: {

    track_inventory?: boolean

    stock_qty?: number

    mark_as_sold?: boolean

    mark_as_non_inventory?: boolean

  } = {}



  if (!product.track_inventory) {

    patch.track_inventory = true

    patch.stock_qty = 0

  }



  if (

    existingVariants.length === 0 ||

    product.mark_as_sold ||

    product.mark_as_non_inventory

  ) {

    patch.mark_as_sold = false

    patch.mark_as_non_inventory = false

  }



  if (Object.keys(patch).length > 0) {

    await productRepository.updateProduct(productId, patch)

  }



  return variant

}



export async function updateVariant(

  ownerId: string,

  productId: number,

  variantId: number,

  input: UpdateProductVariantInput

): Promise<ProductVariant> {

  await assertProductAccess(ownerId, productId)

  await variantRepository.assertVariantBelongsToProduct(variantId, productId)

  return variantRepository.updateVariant(variantId, input)

}



export async function deleteVariant(

  ownerId: string,

  productId: number,

  variantId: number

): Promise<void> {

  await assertProductAccess(ownerId, productId)

  await variantRepository.assertVariantBelongsToProduct(variantId, productId)

  await variantRepository.deleteVariant(variantId)

}


import type { Product } from '../types/product.types.js'

import type { ProductVariant } from '../types/product-variant.types.js'



/** Product-level flags apply only to simple (no-variant) products. */

export function isNonInventoryProduct(product: Product, hasVariants = false): boolean {

  if (hasVariants) return false

  return product.mark_as_non_inventory === true

}



/** Product-level flags apply only to simple (no-variant) products. */

export function isMarkedSoldProduct(product: Product, hasVariants = false): boolean {

  if (hasVariants) return false

  return product.mark_as_sold === true

}



export function isNonInventoryVariant(

  product: Product,

  variant: ProductVariant,

  hasVariants = true

): boolean {

  if (!hasVariants) return isNonInventoryProduct(product, false)

  return variant.mark_as_non_inventory === true

}



export function isMarkedSoldVariant(

  product: Product,

  variant: ProductVariant,

  hasVariants = true

): boolean {

  if (!hasVariants) return isMarkedSoldProduct(product, false)

  return variant.mark_as_sold === true

}



export function shouldValidateProductStock(product: Product): boolean {

  return product.track_inventory && !isNonInventoryProduct(product, false)

}



export function shouldValidateVariantStock(product: Product, variant: ProductVariant): boolean {

  return product.track_inventory && !isNonInventoryVariant(product, variant, true)

}



export function shouldDecrementProductStock(product: Product): boolean {

  return product.track_inventory && !isNonInventoryProduct(product, false)

}



export function shouldDecrementVariantStock(product: Product, variant: ProductVariant): boolean {

  return product.track_inventory && !isNonInventoryVariant(product, variant, true)

}



export function effectiveProductStockQty(product: Product): number {

  if (isMarkedSoldProduct(product, false)) return 0

  return product.stock_qty

}



export function effectiveVariantStockQty(product: Product, variant: ProductVariant): number {

  if (isMarkedSoldVariant(product, variant, true)) return 0

  return variant.stock_qty

}


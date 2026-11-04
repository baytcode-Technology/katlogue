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



/** Same rule checkout uses: inactive or marked sold never sells; untracked or non-inventory always does. */

export function isVariantSellable(product: Product, variant: ProductVariant): boolean {

  if (!variant.is_active) return false

  if (isMarkedSoldVariant(product, variant, true)) return false

  if (!shouldValidateVariantStock(product, variant)) return true

  return effectiveVariantStockQty(product, variant) > 0

}



export function isSimpleProductSellable(product: Product): boolean {

  if (isMarkedSoldProduct(product, false)) return false

  if (!shouldValidateProductStock(product)) return true

  return effectiveProductStockQty(product) > 0

}



/** A product with variants sells when any active variant sells; its own stock number is ignored. */

export function isProductSellable(product: Product, variants: ProductVariant[]): boolean {

  if (variants.length > 0) return variants.some((variant) => isVariantSellable(product, variant))

  return isSimpleProductSellable(product)

}


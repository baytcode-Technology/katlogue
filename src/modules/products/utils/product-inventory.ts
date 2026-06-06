import type { Product } from '../types/product.types.js'
import type { ProductVariant } from '../types/product-variant.types.js'

/** Product-level: applies to entire product and all variants. */
export function isNonInventoryProduct(product: Product): boolean {
  return product.mark_as_non_inventory === true
}

/** Product-level: applies to entire product and all variants. */
export function isMarkedSoldProduct(product: Product): boolean {
  return product.mark_as_sold === true
}

/** Product flags first; variant flags only when product flags are both off. */
export function isNonInventoryVariant(product: Product, variant: ProductVariant): boolean {
  if (isNonInventoryProduct(product)) return true
  return variant.mark_as_non_inventory === true
}

/** Product flags first; variant flags only when product flags are both off. */
export function isMarkedSoldVariant(product: Product, variant: ProductVariant): boolean {
  if (isMarkedSoldProduct(product)) return true
  return variant.mark_as_sold === true
}

export function shouldValidateProductStock(product: Product): boolean {
  return product.track_inventory && !isNonInventoryProduct(product)
}

export function shouldValidateVariantStock(product: Product, variant: ProductVariant): boolean {
  return product.track_inventory && !isNonInventoryVariant(product, variant)
}

export function shouldDecrementProductStock(product: Product): boolean {
  return product.track_inventory && !isNonInventoryProduct(product)
}

export function shouldDecrementVariantStock(product: Product, variant: ProductVariant): boolean {
  return product.track_inventory && !isNonInventoryVariant(product, variant)
}

export function effectiveProductStockQty(product: Product): number {
  if (isMarkedSoldProduct(product)) return 0
  return product.stock_qty
}

export function effectiveVariantStockQty(product: Product, variant: ProductVariant): number {
  if (isMarkedSoldVariant(product, variant)) return 0
  return variant.stock_qty
}

import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

/** Sold out when marked sold, or tracked inventory with qty < 1 (zero or negative). */
export function isCatalogProductSoldOut(product: Product): boolean {
  if (product.mark_as_sold) return true
  if (product.mark_as_non_inventory) return false
  if (!product.track_inventory) return false
  return product.stock_qty < 1
}

export function isCatalogVariantSoldOut(product: Product, variant: ProductVariant): boolean {
  if (product.mark_as_sold) return true
  if (variant.mark_as_sold) return true
  if (product.mark_as_non_inventory || variant.mark_as_non_inventory) return false
  if (!product.track_inventory) return false
  return variant.stock_qty < 1
}

export function isCatalogProductSellable(product: Product): boolean {
  return !isCatalogProductSoldOut(product)
}

export function isCatalogVariantSellable(product: Product, variant: ProductVariant): boolean {
  return !isCatalogVariantSoldOut(product, variant)
}

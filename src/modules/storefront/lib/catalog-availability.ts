import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

/** Public catalog: hide when marked sold or out of stock (qty < 1). */
export function isCatalogProductSellable(product: Product): boolean {
  if (product.mark_as_sold) return false
  if (product.mark_as_non_inventory) return true
  if (!product.track_inventory) return true
  return product.stock_qty >= 1
}

export function isCatalogVariantSellable(product: Product, variant: ProductVariant): boolean {
  if (product.mark_as_sold) return false
  if (variant.mark_as_sold) return false
  if (product.mark_as_non_inventory || variant.mark_as_non_inventory) return true
  if (!product.track_inventory) return true
  return variant.stock_qty >= 1
}

export function filterCatalogVariants(
  product: Product,
  variants: ProductVariant[]
): ProductVariant[] {
  return variants.filter((variant) => isCatalogVariantSellable(product, variant))
}

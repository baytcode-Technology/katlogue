import * as productRepository from '../repositories/product.repository.js'
import * as variantRepository from '../repositories/product-variant.repository.js'
import type { ProductListItem, VariantStockSummary } from '../types/product.types.js'
import type { ProductVariant } from '../types/product-variant.types.js'

function summarizeVariants(variants: ProductVariant[]): VariantStockSummary | null {
  if (variants.length === 0) return null

  let nonInventoryCount = 0
  let soldOutCount = 0
  let minQty = Number.POSITIVE_INFINITY
  let maxQty = Number.NEGATIVE_INFINITY

  for (const variant of variants) {
    if (variant.mark_as_non_inventory) {
      nonInventoryCount += 1
      continue
    }
    if (variant.mark_as_sold) {
      soldOutCount += 1
      continue
    }
    const qty = variant.stock_qty
    minQty = Math.min(minQty, qty)
    maxQty = Math.max(maxQty, qty)
  }

  const tracked = variants.length - nonInventoryCount - soldOutCount

  return {
    count: variants.length,
    non_inventory_count: nonInventoryCount,
    sold_out_count: soldOutCount,
    min_qty: tracked > 0 ? minQty : 0,
    max_qty: tracked > 0 ? maxQty : 0,
  }
}

export async function listProductsByStore(
  ownerId: string,
  storeId: number
): Promise<ProductListItem[]> {
  await productRepository.assertStoreOwner(storeId, ownerId)
  const products = await productRepository.findProductsByStoreId(storeId)

  const variantsByProduct = await variantRepository.findVariantsByProductIds(
    products.map((p) => p.id)
  )

  return products.map((product) => ({
    ...product,
    variant_summary: summarizeVariants(variantsByProduct.get(product.id) ?? []),
  }))
}

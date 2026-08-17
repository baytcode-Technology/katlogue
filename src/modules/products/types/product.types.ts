export type ProductStatus = 'active' | 'draft' | 'unlisted'

export type Product = {
  id: number
  store_id: number
  category_id: number | null
  name: string
  description: string | null
  sku: string | null
  base_price: number
  compare_at_price: number | null
  track_inventory: boolean
  stock_qty: number
  mark_as_sold: boolean
  mark_as_non_inventory: boolean
  images: string[]
  thumbnail_url: string | null
  status: ProductStatus
  is_active: boolean
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

import type { CreateProductVariantInput, ProductVariant } from './product-variant.types.js'

/** Aggregated variant stock for product list cards. */
export type VariantStockSummary = {
  count: number
  non_inventory_count: number
  sold_out_count: number
  min_qty: number
  max_qty: number
}

export type ProductListItem = Product & {
  variant_summary: VariantStockSummary | null
}

export type CreateProductInput = {
  store_id: number
  name: string
  base_price: number
  category_id?: number
  description?: string
  sku?: string
  compare_at_price?: number | null
  track_inventory: boolean
  stock_qty: number
  mark_as_sold?: boolean
  mark_as_non_inventory?: boolean
  images: string[]
  thumbnail_url: string
  status?: ProductStatus
  is_active?: boolean
  sort_order: number
  metadata: Record<string, unknown>
  variants?: CreateProductVariantInput[]
}

export type CreateProductResult = {
  product: Product
  variants: ProductVariant[]
}

/** Only fields present in the request are updated (partial PATCH). */
export type UpdateProductInput = {
  name?: string
  base_price?: number
  category_id?: number | null
  description?: string | null
  sku?: string | null
  compare_at_price?: number | null
  track_inventory?: boolean
  stock_qty?: number
  mark_as_sold?: boolean
  mark_as_non_inventory?: boolean
  images?: string[]
  thumbnail_url?: string | null
  status?: ProductStatus
  is_active?: boolean
  sort_order?: number
  metadata?: Record<string, unknown>
}

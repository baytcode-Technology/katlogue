export type ProductVariant = {
  id: number
  product_id: number
  name: string
  options: Record<string, unknown>
  price_delta: number
  compare_at_price: number | null
  stock_qty: number
  mark_as_sold: boolean
  mark_as_non_inventory: boolean
  sku: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
}

export type CreateProductVariantInput = {
  name: string
  options?: Record<string, unknown>
  price_delta: number
  compare_at_price?: number | null
  stock_qty: number
  mark_as_sold?: boolean
  mark_as_non_inventory?: boolean
  sku?: string
  image_url?: string
  is_active: boolean
  sort_order: number
}

export type UpdateProductVariantInput = {
  name?: string
  options?: Record<string, unknown>
  price_delta?: number
  compare_at_price?: number | null
  stock_qty?: number
  mark_as_sold?: boolean
  mark_as_non_inventory?: boolean
  sku?: string | null
  image_url?: string | null
  is_active?: boolean
  sort_order?: number
}

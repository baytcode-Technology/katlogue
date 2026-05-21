export type ProductVariant = {
  id: string
  product_id: string
  name: string
  options: Record<string, unknown>
  price_delta: number
  stock_qty: number
  sku: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
}

export type CreateProductVariantInput = {
  name: string
  options?: Record<string, unknown>
  price_delta: number
  stock_qty: number
  sku?: string
  image_url?: string
  is_active: boolean
  sort_order: number
}

export type UpdateProductVariantInput = {
  name?: string
  options?: Record<string, unknown>
  price_delta?: number
  stock_qty?: number
  sku?: string | null
  image_url?: string | null
  is_active?: boolean
  sort_order?: number
}

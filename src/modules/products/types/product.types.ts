export type Product = {
  id: string
  store_id: string
  category_id: string | null
  name: string
  description: string | null
  sku: string | null
  base_price: number
  compare_at_price: number | null
  track_inventory: boolean
  stock_qty: number
  images: string[]
  thumbnail_url: string | null
  is_active: boolean
  sort_order: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CreateProductInput = {
  store_id: string
  name: string
  base_price: number
  category_id?: string
  description?: string
  sku?: string
  compare_at_price?: number
  track_inventory: boolean
  stock_qty: number
  images: string[]
  thumbnail_url?: string
  is_active: boolean
  sort_order: number
  metadata: Record<string, unknown>
}

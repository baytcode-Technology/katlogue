export type Category = {
  id: string
  store_id: string
  parent_id: string | null
  name: string
  slug: string
  image_url: string
  sort_order: number
  is_active: boolean
  description: string | null
  created_at: string
}

export type UpdateCategoryInput = Partial<{
  name: string
  slug: string
  image_url: string
  is_active: boolean
  description: string | null
  parent_id: string | null
  sort_order: number
}>

export type CategoryWithProductCount = Category & {
  product_count: number
}

export type CreateCategoryInput = {
  store_id: string
  name: string
  slug: string
  parent_id?: string
  image_url: string
  sort_order: number
  is_active: boolean
}

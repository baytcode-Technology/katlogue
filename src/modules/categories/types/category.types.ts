export type Category = {
  id: string
  store_id: string
  parent_id: string | null
  name: string
  slug: string
  image_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export type CreateCategoryInput = {
  store_id: string
  name: string
  slug: string
  parent_id?: string
  image_url?: string
  sort_order: number
  is_active: boolean
}

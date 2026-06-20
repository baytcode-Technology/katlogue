export type Category = {

  id: number

  store_id: number

  parent_id: number | null

  name: string

  image_url: string | null

  sort_order: number

  is_active: boolean

  description: string | null

  created_at: string

}



export type UpdateCategoryInput = Partial<{

  name: string

  image_url: string | null

  is_active: boolean

  description: string | null

  parent_id: number | null

  sort_order: number

}>



export type CategoryWithProductCount = Category & {

  product_count: number

}



export type CreateCategoryInput = {

  store_id: number

  name: string

  parent_id?: number

  image_url?: string | null

  sort_order: number

  is_active: boolean

}


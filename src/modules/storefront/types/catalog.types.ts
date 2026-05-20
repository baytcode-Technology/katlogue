import type { Category } from '../../categories/types/category.types.js'
import type { Product } from '../../products/types/product.types.js'

export type CatalogSort =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'

export type CatalogQuery = {
  category_id?: string
  product_id?: string
  sort: CatalogSort
  min_price?: number
  max_price?: number
}

export type CatalogResponse = {
  categories: Category[]
  products: Product[]
}


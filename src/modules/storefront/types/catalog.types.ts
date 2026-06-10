import type { Category } from '../../categories/types/category.types.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

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

export type CatalogProduct = Product & {
  variants: ProductVariant[]
}

export type CatalogResponse = {
  categories: Category[]
  products: CatalogProduct[]
}


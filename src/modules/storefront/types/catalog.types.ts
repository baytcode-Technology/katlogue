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

export type CatalogVariant = ProductVariant & {
  sold_out: boolean
}

export type CatalogProduct = Product & {
  variants: CatalogVariant[]
  sold_out: boolean
}

export type CatalogResponse = {
  categories: Category[]
  products: CatalogProduct[]
}

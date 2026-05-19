import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveCategoriesByStoreId } from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { CatalogQuery, CatalogResponse, CatalogSort } from '../types/catalog.types.js'

function filterByPrice(
  products: Product[],
  minPrice?: number,
  maxPrice?: number
): Product[] {
  return products.filter((p) => {
    if (minPrice !== undefined && p.base_price < minPrice) return false
    if (maxPrice !== undefined && p.base_price > maxPrice) return false
    return true
  })
}

function sortProducts(products: Product[], sort: CatalogSort): Product[] {
  const list = [...products]

  switch (sort) {
    case 'name_asc':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    case 'name_desc':
      return list.sort((a, b) => b.name.localeCompare(a.name))
    case 'price_asc':
      return list.sort((a, b) => a.base_price - b.base_price)
    case 'price_desc':
      return list.sort((a, b) => b.base_price - a.base_price)
    case 'default':
    default:
      return list.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
  }
}

export async function getCatalog(
  storeId: string,
  query: CatalogQuery
): Promise<CatalogResponse> {
  const [categories, allProducts] = await Promise.all([
    findActiveCategoriesByStoreId(storeId),
    findActiveProductsByStoreId(storeId),
  ])

  let products = filterByPrice(allProducts, query.min_price, query.max_price)
  products = sortProducts(products, query.sort)

  if (query.product_id) {
    const product = products.find((p) => p.id === query.product_id)
    if (!product) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
    }
    return {
      categories,
      products: [product],
    }
  }

  if (query.category_id) {
    const categoryExists = categories.some((c) => c.id === query.category_id)
    if (!categoryExists) {
      throw new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND')
    }
    products = products.filter((p) => p.category_id === query.category_id)
  }

  return {
    categories,
    products,
  }
}

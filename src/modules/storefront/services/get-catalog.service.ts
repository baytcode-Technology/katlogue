import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveCategoriesByStoreId } from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type {
  CatalogQuery,
  CatalogResponse,
  CatalogSort,
  CategoryWithProducts,
} from '../types/catalog.types.js'
import type { Category } from '../../categories/types/category.types.js'

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

function nestProductsInCategories(
  categories: Category[],
  products: Product[]
): { categories: CategoryWithProducts[]; uncategorizedProducts: Product[] } {
  const byCategory = new Map<string, Product[]>()

  for (const product of products) {
    if (!product.category_id) continue
    const list = byCategory.get(product.category_id) ?? []
    list.push(product)
    byCategory.set(product.category_id, list)
  }

  const categoriesWithProducts: CategoryWithProducts[] = categories.map((category) => ({
    ...category,
    products: byCategory.get(category.id) ?? [],
  }))

  const uncategorizedProducts = products.filter((p) => !p.category_id)

  return { categories: categoriesWithProducts, uncategorizedProducts }
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

  if (query.category_id) {
    const categoryExists = categories.some((c) => c.id === query.category_id)
    if (!categoryExists) {
      throw new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND')
    }

    const filtered = products.filter((p) => p.category_id === query.category_id)
    const category = categories.find((c) => c.id === query.category_id)!

    return {
      layout: 'categories',
      categories: [{ ...category, products: filtered }],
      uncategorizedProducts: [],
    }
  }

  if (categories.length === 0) {
    return {
      layout: 'products_only',
      categories: [],
      products,
    }
  }

  const nested = nestProductsInCategories(categories, products)

  return {
    layout: 'categories',
    categories: nested.categories,
    uncategorizedProducts: sortProducts(nested.uncategorizedProducts, query.sort),
  }
}

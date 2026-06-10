import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveCategoriesByStoreId } from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import * as variantRepository from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import type {
  CatalogProduct,
  CatalogQuery,
  CatalogResponse,
  CatalogSort,
} from '../types/catalog.types.js'
import {
  filterCatalogVariants,
  isCatalogProductSellable,
} from '../lib/catalog-availability.js'

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

function toCatalogProduct(
  product: Product,
  variantMap: Map<string, ProductVariant[]>
): CatalogProduct | null {
  if (product.mark_as_sold) return null

  const allVariants = variantMap.get(product.id) ?? []

  if (allVariants.length > 0) {
    const variants = filterCatalogVariants(product, allVariants)
    if (variants.length === 0) return null
    return { ...product, variants }
  }

  if (!isCatalogProductSellable(product)) return null
  return { ...product, variants: [] }
}

function buildCatalogProducts(
  products: Product[],
  variantMap: Map<string, ProductVariant[]>
): CatalogProduct[] {
  const catalog: CatalogProduct[] = []
  for (const product of products) {
    const row = toCatalogProduct(product, variantMap)
    if (row) catalog.push(row)
  }
  return catalog
}

async function loadCatalogProducts(products: Product[]): Promise<CatalogProduct[]> {
  const variantMap = await variantRepository.findVariantsByProductIds(
    products.map((p) => p.id)
  )
  return buildCatalogProducts(products, variantMap)
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
    const catalogProduct = (await loadCatalogProducts([product]))[0]
    if (!catalogProduct) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
    }
    return {
      categories,
      products: [catalogProduct],
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
    products: await loadCatalogProducts(products),
  }
}

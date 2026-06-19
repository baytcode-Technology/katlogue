import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveCategoriesByStoreId } from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import * as variantRepository from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import {
  buildCatalogCategoryTree,
  collectCategoryIds,
} from '../lib/build-category-tree.js'
import {
  isCatalogProductSoldOut,
  isCatalogVariantSoldOut,
} from '../lib/catalog-availability.js'
import type {
  CatalogProduct,
  CatalogQuery,
  CatalogResponse,
  CatalogSort,
  CatalogVariant,
} from '../types/catalog.types.js'

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
): CatalogProduct {
  const allVariants = variantMap.get(product.id) ?? []

  if (allVariants.length > 0) {
    const variants: CatalogVariant[] = allVariants.map((variant) => ({
      ...variant,
      sold_out: isCatalogVariantSoldOut(product, variant),
    }))
    const sold_out = variants.every((variant) => variant.sold_out)
    return { ...product, variants, sold_out }
  }

  return {
    ...product,
    variants: [],
    sold_out: isCatalogProductSoldOut(product),
  }
}

function buildCatalogProducts(
  products: Product[],
  variantMap: Map<string, ProductVariant[]>
): CatalogProduct[] {
  return products.map((product) => toCatalogProduct(product, variantMap))
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
  const [flatCategories, allProducts] = await Promise.all([
    findActiveCategoriesByStoreId(storeId),
    findActiveProductsByStoreId(storeId),
  ])
  const categories = buildCatalogCategoryTree(flatCategories)
  const categoryIds = collectCategoryIds(categories)

  let products = filterByPrice(allProducts, query.min_price, query.max_price)
  products = sortProducts(products, query.sort)

  if (query.product_id) {
    const product = products.find((p) => p.id === query.product_id)
    if (!product) {
      throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND')
    }
    const catalogProduct = (await loadCatalogProducts([product]))[0]
    return {
      categories,
      products: [catalogProduct],
    }
  }

  if (query.category_id) {
    const categoryExists = categoryIds.has(query.category_id)
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

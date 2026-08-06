import { env } from '../../../config/env.js'
import {
  buildStorefrontProductUrl,
  buildSubdomainUrl,
  formatMoney,
} from '../../../shared/utils/storefront.js'
import * as categoryRepository from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import { findVariantsByProductIds } from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

export type CatalogMatch = {
  product: Product
  variant: ProductVariant | null
  price: number
  url: string
}

const MAX_RESULTS = 5

function unitPrice(product: Product, variant: ProductVariant | null): number {
  return Number(product.base_price) + Number(variant?.price_delta ?? 0)
}

function buildUrl(storeSlug: string, product: Product, variantId?: number | null): string {
  return buildStorefrontProductUrl(storeSlug, env.STOREFRONT_BASE_DOMAIN, product, variantId)
}

function scoreProduct(product: Product, query: string): number {
  const q = query.toLowerCase()
  const name = product.name.toLowerCase()
  const desc = (product.description ?? '').toLowerCase()
  if (name === q) return 100
  if (name.includes(q)) return 80
  if (desc.includes(q)) return 40
  const tokens = q.split(/\s+/).filter(Boolean)
  let score = 0
  for (const t of tokens) {
    if (name.includes(t)) score += 20
    if (desc.includes(t)) score += 5
  }
  return score
}

function variantMatchesQuery(variant: ProductVariant, query: string): boolean {
  const q = query.toLowerCase()
  if (variant.name.toLowerCase().includes(q)) return true
  return Object.values(variant.options ?? {}).some((v) =>
    String(v).toLowerCase().includes(q)
  )
}

function pickBestVariant(
  variants: ProductVariant[],
  query: string
): ProductVariant | null {
  const active = variants.filter((v) => v.is_active)
  if (active.length === 0) return null
  const matched = active.find((v) => variantMatchesQuery(v, query))
  return matched ?? active[0] ?? null
}

export async function searchCatalog(
  storeId: number,
  storeSlug: string,
  currency: string,
  query: string
): Promise<CatalogMatch[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const products = await findActiveProductsByStoreId(storeId)
  const variantMap = await findVariantsByProductIds(products.map((p) => p.id))

  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, trimmed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)

  return scored.map(({ product }) => {
    const variants = variantMap.get(product.id) ?? []
    const variant = pickBestVariant(variants, trimmed)
    const price = unitPrice(product, variant)
    return {
      product,
      variant,
      price,
      url: buildUrl(storeSlug, product, variant?.id ?? null),
    }
  })
}

export async function findBySku(
  storeId: number,
  storeSlug: string,
  currency: string,
  sku: string
): Promise<CatalogMatch | null> {
  const normalized = sku.trim().toLowerCase()
  if (!normalized) return null

  const products = await findActiveProductsByStoreId(storeId)
  const variantMap = await findVariantsByProductIds(products.map((p) => p.id))

  for (const product of products) {
    if (product.sku?.trim().toLowerCase() === normalized) {
      const variants = variantMap.get(product.id) ?? []
      const variant = variants.find((v) => v.is_active) ?? null
      return {
        product,
        variant,
        price: unitPrice(product, variant),
        url: buildUrl(storeSlug, product, variant?.id ?? null),
      }
    }
    const variants = variantMap.get(product.id) ?? []
    const variant = variants.find(
      (v) => v.is_active && v.sku?.trim().toLowerCase() === normalized
    )
    if (variant) {
      return {
        product,
        variant,
        price: unitPrice(product, variant),
        url: buildUrl(storeSlug, product, variant.id),
      }
    }
  }

  return null
}

export async function findByCategoryName(
  storeId: number,
  storeSlug: string,
  currency: string,
  categoryName: string
): Promise<CatalogMatch[]> {
  const name = categoryName.trim().toLowerCase()
  if (!name) return []

  const categories = await categoryRepository.findCategoriesByStoreId(storeId)
  const category = categories.find((c) => c.name.toLowerCase().includes(name) && c.is_active)
  if (!category) return []

  const products = await findActiveProductsByStoreId(storeId)
  const inCategory = products.filter((p) => p.category_id === category.id).slice(0, MAX_RESULTS)
  const variantMap = await findVariantsByProductIds(inCategory.map((p) => p.id))

  return inCategory.map((product) => {
    const variants = variantMap.get(product.id) ?? []
    const variant = variants.find((v) => v.is_active) ?? null
    return {
      product,
      variant,
      price: unitPrice(product, variant),
      url: buildUrl(storeSlug, product, variant?.id ?? null),
    }
  })
}

export function formatCatalogMatches(matches: CatalogMatch[], currency: string): string {
  if (matches.length === 0) {
    return ''
  }

  return matches
    .map((m) => {
      const title = m.variant ? `${m.product.name} — ${m.variant.name}` : m.product.name
      return `${title}\n${formatMoney(m.price, currency)}\n${m.url}`
    })
    .join('\n\n')
}

export function getStoreHomeUrl(storeSlug: string): string {
  return buildSubdomainUrl(storeSlug, env.STOREFRONT_BASE_DOMAIN)
}

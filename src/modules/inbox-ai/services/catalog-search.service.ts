import {
  buildStorefrontProductUrl,
  buildSubdomainUrl,
  formatMoney,
  getPublicStorefrontBaseDomain,
} from '../../../shared/utils/storefront.js'
import * as categoryRepository from '../../categories/repositories/category.repository.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'
import { findVariantsByProductIds } from '../../products/repositories/product-variant.repository.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'
import type { ParsedCustomerIntent } from './parse-customer-intent.service.js'

export type CatalogMatch = {
  product: Product
  variant: ProductVariant | null
  price: number
  url: string
  score: number
}

export type CatalogSearchFilters = {
  query: string
  color?: string | null
  size?: string | null
}

const MAX_RESULTS = 5

function unitPrice(product: Product, variant: ProductVariant | null): number {
  return Number(product.base_price) + Number(variant?.price_delta ?? 0)
}

function buildUrl(storeSlug: string, product: Product, variantId?: number | null): string {
  return buildStorefrontProductUrl(
    storeSlug,
    getPublicStorefrontBaseDomain(),
    product,
    variantId
  )
}

function normalizeOptionValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function getVariantOptions(variant: ProductVariant): { color: string | null; size: string | null } {
  const opts = variant.options ?? {}
  let color: string | null = null
  let size: string | null = null

  for (const [key, value] of Object.entries(opts)) {
    const k = key.toLowerCase()
    const v = String(value).trim()
    if (k.includes('color') || k.includes('colour')) color = v
    if (k.includes('size')) size = v.toUpperCase()
  }

  return { color, size }
}

function scoreProduct(product: Product, query: string): number {
  const q = query.toLowerCase()
  if (!q) return 10
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

function scoreVariant(
  variant: ProductVariant,
  filters: CatalogSearchFilters
): number {
  let score = 0
  const q = filters.query.toLowerCase()
  const { color, size } = getVariantOptions(variant)

  if (filters.color) {
    const want = filters.color.toLowerCase()
    const variantColor = color?.toLowerCase() ?? ''
    const name = variant.name.toLowerCase()
    if (variantColor === want || variantColor.includes(want) || name.includes(want)) {
      score += 50
    } else if (Object.values(variant.options ?? {}).some((v) => normalizeOptionValue(v).includes(want))) {
      score += 40
    } else {
      score -= 30
    }
  }

  if (filters.size) {
    const want = filters.size.toUpperCase()
    const variantSize = size?.toUpperCase() ?? ''
    const name = variant.name.toUpperCase()
    if (variantSize === want || name.includes(want)) {
      score += 40
    } else {
      score -= 20
    }
  }

  if (q && variant.name.toLowerCase().includes(q)) score += 15
  if (q) {
    for (const v of Object.values(variant.options ?? {})) {
      if (normalizeOptionValue(v).includes(q)) score += 10
    }
  }

  return score
}

function pickBestVariant(
  variants: ProductVariant[],
  filters: CatalogSearchFilters
): ProductVariant | null {
  const active = variants.filter((v) => v.is_active)
  if (active.length === 0) return null

  const scored = active
    .map((variant) => ({ variant, score: scoreVariant(variant, filters) }))
    .sort((a, b) => b.score - a.score)

  if (scored[0] && scored[0].score > 0) return scored[0].variant
  return active[0] ?? null
}

function toMatch(
  storeSlug: string,
  product: Product,
  variant: ProductVariant | null,
  score: number
): CatalogMatch {
  return {
    product,
    variant,
    price: unitPrice(product, variant),
    url: buildUrl(storeSlug, product, variant?.id ?? null),
    score,
  }
}

function searchProducts(
  products: Product[],
  variantMap: Map<number, ProductVariant[]>,
  storeSlug: string,
  filters: CatalogSearchFilters
): CatalogMatch[] {
  const scored = products
    .map((product) => {
      const productScore = scoreProduct(product, filters.query)
      const variants = variantMap.get(product.id) ?? []
      const variant = pickBestVariant(variants, filters)
      const variantScore = variant ? scoreVariant(variant, filters) : 0
      const total = productScore + variantScore
      return { product, variant, total }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_RESULTS)

  return scored.map(({ product, variant, total }) =>
    toMatch(storeSlug, product, variant, total)
  )
}

export async function searchCatalog(
  storeId: number,
  storeSlug: string,
  currency: string,
  filters: CatalogSearchFilters | string
): Promise<CatalogMatch[]> {
  const normalized: CatalogSearchFilters =
    typeof filters === 'string' ? { query: filters.trim() } : filters
  const trimmed = normalized.query.trim()
  if (!trimmed && !normalized.color && !normalized.size) return []

  const products = await findActiveProductsByStoreId(storeId)
  const variantMap = await findVariantsByProductIds(products.map((p) => p.id))

  if (!trimmed && (normalized.color || normalized.size)) {
    const all = products.map((product) => {
      const variants = variantMap.get(product.id) ?? []
      const variant = pickBestVariant(variants, normalized)
      const variantScore = variant ? scoreVariant(variant, normalized) : 0
      return { product, variant, total: variantScore }
    })
    return all
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, MAX_RESULTS)
      .map(({ product, variant, total }) => toMatch(storeSlug, product, variant, total))
  }

  return searchProducts(products, variantMap, storeSlug, normalized)
}

export async function searchCatalogFromIntent(
  storeId: number,
  storeSlug: string,
  currency: string,
  intent: Pick<ParsedCustomerIntent, 'searchQuery' | 'color' | 'size'>
): Promise<CatalogMatch[]> {
  return searchCatalog(storeId, storeSlug, currency, {
    query: intent.searchQuery,
    color: intent.color,
    size: intent.size,
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
      return toMatch(storeSlug, product, variant, 100)
    }
    const variants = variantMap.get(product.id) ?? []
    const variant = variants.find(
      (v) => v.is_active && v.sku?.trim().toLowerCase() === normalized
    )
    if (variant) {
      return toMatch(storeSlug, product, variant, 100)
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
  const inCategory = products.filter((p) => p.category_id === category.id)
  const variantMap = await findVariantsByProductIds(inCategory.map((p) => p.id))

  return inCategory
    .slice(0, MAX_RESULTS)
    .map((product, index) => {
      const variants = variantMap.get(product.id) ?? []
      const variant = variants.find((v) => v.is_active) ?? null
      return toMatch(storeSlug, product, variant, 50 - index)
    })
}

export function getMatchImageUrl(match: CatalogMatch): string | null {
  return (
    match.variant?.image_url?.trim() ||
    match.product.thumbnail_url?.trim() ||
    match.product.images?.[0]?.trim() ||
    null
  )
}

function formatVariantDetails(match: CatalogMatch): string {
  const parts: string[] = []
  const { color, size } = match.variant ? getVariantOptions(match.variant) : { color: null, size: null }
  if (color) parts.push(`Color: ${color}`)
  if (size) parts.push(`Size: ${size}`)
  return parts.join(' | ')
}

export function formatProductCaption(match: CatalogMatch, currency: string): string {
  const title = match.variant
    ? `${match.product.name} — ${match.variant.name}`
    : match.product.name
  const lines = [title, formatMoney(match.price, currency)]

  const variantDetails = formatVariantDetails(match)
  if (variantDetails) lines.push(variantDetails)

  const sku = match.variant?.sku?.trim() || match.product.sku?.trim()
  if (sku) lines.push(`SKU: ${sku}`)

  lines.push('', match.url)
  return lines.join('\n')
}

export function formatOtherMatches(matches: CatalogMatch[], currency: string): string {
  if (matches.length === 0) return ''

  const lines = matches.map((m) => {
    const title = m.variant ? `${m.product.name} — ${m.variant.name}` : m.product.name
    return `• ${title} — ${formatMoney(m.price, currency)}\n  ${m.url}`
  })

  return `I also found these:\n\n${lines.join('\n\n')}`
}

export function getStoreHomeUrl(storeSlug: string): string {
  return buildSubdomainUrl(storeSlug, getPublicStorefrontBaseDomain())
}

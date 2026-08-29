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
  categoryName?: string | null
}

const MAX_RESULTS = 5
export const MIN_MATCH_SCORE = 25
const CATALOG_SUMMARY_LIMIT = 12
const CATEGORY_MATCH_BOOST = 60
const CATEGORY_CONFLICT_PENALTY = 80

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  pants: ['pant', 'pants', 'trouser', 'trousers', 'jeans'],
  shirts: ['t-shirt', 'tshirt', 'shirt', 'shirts'],
  dresses: ['dress', 'dresses'],
  kurtas: ['kurta', 'kurtas'],
  sarees: ['saree', 'sari', 'sarees'],
  tops: ['top', 'tops'],
  jackets: ['jacket', 'jackets'],
  shoes: ['shoe', 'shoes'],
  beanies: ['beanie', 'benny', 'beanies'],
  innerwear: ['innerwear'],
}

function canonicalCatalogCategory(term: string | null | undefined): string | null {
  const lower = term?.toLowerCase().trim()
  if (!lower) return null
  for (const [canonical, words] of Object.entries(CATEGORY_SYNONYMS)) {
    if (canonical === lower || words.some((w) => lower === w || lower.includes(w))) {
      return canonical
    }
  }
  return null
}

function synonymsFor(categoryName: string | null | undefined): string[] {
  const canonical = canonicalCatalogCategory(categoryName)
  if (!canonical) return []
  return CATEGORY_SYNONYMS[canonical] ?? []
}

function textHasCategoryWord(text: string, words: string[]): boolean {
  const lower = text.toLowerCase()
  return words.some((w) => lower.includes(w))
}

export function productMatchesRequestedCategory(
  product: Pick<Product, 'name' | 'description'>,
  categoryName: string | null | undefined
): boolean {
  if (!categoryName) return true
  const words = synonymsFor(categoryName)
  if (words.length === 0) return true
  const haystack = `${product.name} ${product.description ?? ''}`.toLowerCase()
  return textHasCategoryWord(haystack, words)
}

export function resolveEffectiveSearchQuery(
  query: string,
  categoryName?: string | null
): string {
  const trimmed = query.trim()
  const canonicalCategory = canonicalCatalogCategory(categoryName)
  const canonicalQuery = canonicalCatalogCategory(trimmed)
  if (canonicalCategory && canonicalQuery && canonicalCategory !== canonicalQuery) {
    return canonicalCategory
  }
  return trimmed || categoryName?.trim() || ''
}

function categoryAffinityScore(
  product: Pick<Product, 'name' | 'description'>,
  categoryName?: string | null
): number {
  if (!categoryName) return 0
  const canonical = canonicalCatalogCategory(categoryName)
  if (!canonical) return 0
  const haystack = `${product.name} ${product.description ?? ''}`.toLowerCase()
  if (textHasCategoryWord(haystack, CATEGORY_SYNONYMS[canonical] ?? [])) {
    return CATEGORY_MATCH_BOOST
  }
  for (const [key, words] of Object.entries(CATEGORY_SYNONYMS)) {
    if (key === canonical) continue
    if (textHasCategoryWord(haystack, words)) return -CATEGORY_CONFLICT_PENALTY
  }
  return 0
}

export function scoreProduct(
  product: Pick<Product, 'name' | 'description'>,
  query: string,
  categoryName?: string | null
): number {
  const q = resolveEffectiveSearchQuery(query, categoryName).toLowerCase()
  const name = product.name.toLowerCase()
  const desc = (product.description ?? '').toLowerCase()
  let score = 0
  if (!q) {
    score = 10
  } else if (name === q) {
    score = 100
  } else if (name.includes(q)) {
    score = 80
  } else if (desc.includes(q)) {
    score = 40
  } else {
    const tokens = q.split(/\s+/).filter(Boolean)
    for (const t of tokens) {
      if (name.includes(t)) score += 20
      if (desc.includes(t)) score += 5
    }
  }
  return score + categoryAffinityScore(product, categoryName)
}

export type StoreCatalogSummary = {
  productNames: string[]
  categoryNames: string[]
}

export function filterMatchesByScore(matches: CatalogMatch[]): CatalogMatch[] {
  return matches.filter((m) => m.score >= MIN_MATCH_SCORE)
}

export function pickPrimaryCatalogMatch(
  matches: CatalogMatch[],
  categoryName?: string | null
): CatalogMatch | null {
  if (matches.length === 0) return null
  if (!categoryName) return matches[0]
  return matches.find((m) => productMatchesRequestedCategory(m.product, categoryName)) ?? null
}

export async function getStoreCatalogSummary(storeId: number): Promise<StoreCatalogSummary> {
  const [products, categories] = await Promise.all([
    findActiveProductsByStoreId(storeId),
    categoryRepository.findCategoriesByStoreId(storeId),
  ])

  const productNames = products
    .slice(0, CATALOG_SUMMARY_LIMIT)
    .map((p) => p.name.trim())
    .filter(Boolean)

  const categoryNames = categories
    .filter((c) => c.is_active)
    .map((c) => c.name.trim())
    .filter(Boolean)

  return { productNames, categoryNames }
}

export function formatAvailableProducts(summary: StoreCatalogSummary): string[] {
  const names = new Set<string>()
  for (const name of summary.productNames) names.add(name)
  for (const name of summary.categoryNames) names.add(name)
  return [...names]
}

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

function variantMatchesColor(variant: ProductVariant, wantColor: string): boolean {
  const want = wantColor.toLowerCase()
  const { color } = getVariantOptions(variant)
  const variantColor = color?.toLowerCase() ?? ''
  const name = variant.name.toLowerCase()
  if (variantColor === want || variantColor.includes(want) || name.includes(want)) {
    return true
  }
  return Object.values(variant.options ?? {}).some((v) =>
    normalizeOptionValue(v).includes(want)
  )
}

function productMatchesColor(
  product: Product,
  variants: ProductVariant[],
  wantColor: string
): boolean {
  const want = wantColor.toLowerCase()
  const name = product.name.toLowerCase()
  const desc = (product.description ?? '').toLowerCase()
  if (name.includes(want) || desc.includes(want)) return true
  const active = variants.filter((v) => v.is_active)
  return active.some((v) => variantMatchesColor(v, wantColor))
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

  const eligible = filters.color
    ? active.filter((v) => variantMatchesColor(v, filters.color!))
    : active

  if (filters.color && eligible.length === 0) return null

  const pool = eligible.length > 0 ? eligible : active

  const scored = pool
    .map((variant) => ({ variant, score: scoreVariant(variant, filters) }))
    .sort((a, b) => b.score - a.score)

  if (scored[0] && scored[0].score > 0) return scored[0].variant
  if (filters.color) return eligible[0] ?? null
  return pool[0] ?? null
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
      const variants = variantMap.get(product.id) ?? []
      if (filters.color && !productMatchesColor(product, variants, filters.color)) {
        return null
      }
      const productScore = scoreProduct(product, filters.query, filters.categoryName)
      const variant = pickBestVariant(variants, filters)
      if (filters.color && !variant) return null
      const variantScore = variant ? scoreVariant(variant, filters) : 0
      const total = productScore + variantScore
      return { product, variant, total }
    })
    .filter((row): row is { product: Product; variant: ProductVariant | null; total: number } =>
      row !== null && row.total > 0
    )
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
  const trimmed = resolveEffectiveSearchQuery(normalized.query, normalized.categoryName)
  normalized.query = trimmed
  if (!trimmed && !normalized.color && !normalized.size && !normalized.categoryName) return []

  const products = await findActiveProductsByStoreId(storeId)
  const variantMap = await findVariantsByProductIds(products.map((p) => p.id))

  if (!trimmed && (normalized.color || normalized.size)) {
    const all = products
      .map((product) => {
        const variants = variantMap.get(product.id) ?? []
        if (normalized.color && !productMatchesColor(product, variants, normalized.color)) {
          return null
        }
        const variant = pickBestVariant(variants, normalized)
        if (normalized.color && !variant) return null
        const variantScore = variant ? scoreVariant(variant, normalized) : 0
        return variantScore > 0 ? { product, variant, total: variantScore } : null
      })
      .filter((row): row is { product: Product; variant: ProductVariant | null; total: number } =>
        row !== null
      )
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
  intent: Pick<ParsedCustomerIntent, 'searchQuery' | 'color' | 'size' | 'categoryName'>
): Promise<CatalogMatch[]> {
  return searchCatalog(storeId, storeSlug, currency, {
    query: resolveEffectiveSearchQuery(intent.searchQuery, intent.categoryName),
    color: intent.color,
    size: intent.size,
    categoryName: intent.categoryName,
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

export function formatOtherMatches(
  matches: CatalogMatch[],
  currency: string,
  header = 'I also found these:'
): string {
  if (matches.length === 0) return ''

  const lines = matches.map((m) => {
    const title = m.variant ? `${m.product.name} — ${m.variant.name}` : m.product.name
    return `• ${title} — ${formatMoney(m.price, currency)}\n  ${m.url}`
  })

  return `${header}\n\n${lines.join('\n\n')}`
}

export function getStoreHomeUrl(storeSlug: string): string {
  return buildSubdomainUrl(storeSlug, getPublicStorefrontBaseDomain())
}

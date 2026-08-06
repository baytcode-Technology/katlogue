import { env } from '../../config/env.js'
import { RESERVED_SUBDOMAINS } from '../constants/reserved-subdomains.js'

const SUBDOMAIN_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export function isValidSubdomainSlug(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 63 &&
    SUBDOMAIN_SLUG_REGEX.test(slug) &&
    !RESERVED_SUBDOMAINS.has(slug)
  )
}

/** Domain for links sent to customers (WhatsApp, Instagram, emails). Never localhost. */
export function getPublicStorefrontBaseDomain(): string {
  const override = process.env.STOREFRONT_PUBLIC_BASE_DOMAIN?.trim()
  if (override) return override

  const base = env.STOREFRONT_BASE_DOMAIN
  if (!base || base === 'localhost' || base.includes('localhost')) {
    return 'aishopy.io'
  }
  return base
}

export function buildSubdomainUrl(slug: string, baseDomain: string): string {
  const protocol = baseDomain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${slug}.${baseDomain}`
}

export function slugifyProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildProductSlug(product: { id: number; name: string }): string {
  return `${slugifyProductName(product.name)}${product.id ? `-${product.id}` : ''}`
}

export function buildStorefrontProductUrl(
  storeSlug: string,
  baseDomain: string,
  product: { id: number; name: string },
  variantId?: number | null
): string {
  const base = `${buildSubdomainUrl(storeSlug, baseDomain)}/product/${buildProductSlug(product)}`
  if (variantId != null) {
    return `${base}?variant=${variantId}`
  }
  return base
}

export function formatMoney(amount: number, currency?: string): string {
  const code = currency?.trim() || 'INR'
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(0)}`
  }
}

export function extractStoreSlugFromHost(
  host: string,
  baseDomain: string
): string | null {
  const hostname = host.split(':')[0].toLowerCase()

  if (hostname === baseDomain) {
    return null
  }

  const suffix = `.${baseDomain}`
  if (!hostname.endsWith(suffix)) {
    return null
  }

  const slug = hostname.slice(0, -suffix.length)
  if (!slug || slug.includes('.')) {
    return null
  }

  if (!isValidSubdomainSlug(slug)) {
    return null
  }

  return slug
}

export function extractStoreSlugFromRequest(
  host: string,
  baseDomain: string,
  storeSlugHeader?: string
): string | null {
  const fromHost = extractStoreSlugFromHost(host, baseDomain)
  if (fromHost) {
    return fromHost
  }

  // Fallback when the request hits the API host (e.g. Railway) instead of a store subdomain.
  if (storeSlugHeader) {
    const slug = storeSlugHeader.toLowerCase().trim()
    return isValidSubdomainSlug(slug) ? slug : null
  }

  return null
}

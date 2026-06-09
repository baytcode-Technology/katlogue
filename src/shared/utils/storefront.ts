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

export function buildSubdomainUrl(slug: string, baseDomain: string): string {
  const protocol = baseDomain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${slug}.${baseDomain}`
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

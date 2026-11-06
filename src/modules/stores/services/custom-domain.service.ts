import { resolve4, resolveCname } from 'node:dns/promises'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import { getPublicStorefrontBaseDomain } from '../../../shared/utils/storefront.js'
import { hasPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeStaffRepository from '../repositories/store-staff.repository.js'
import * as storeRepository from '../repositories/store.repository.js'
import type { Store } from '../types/store.types.js'
import {
  addVercelProjectDomain,
  removeVercelProjectDomain,
  storefrontCnameTarget,
} from './vercel-domain.service.js'

const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export type CustomDomainView = {
  subdomain: string
  custom_domain: string | null
  status: 'none' | 'pending' | 'active' | 'failed'
  verified_at: string | null
  cname_host: string
  cname_target: string
  dns_type: 'A' | 'CNAME'
  dns_name: string
  dns_value: string
}

const VERCEL_APEX_A = '76.76.21.21'

const MULTI_PART_SUFFIXES = [
  'co.in',
  'com.in',
  'net.in',
  'org.in',
  'firm.in',
  'gen.in',
  'ind.in',
  'co.uk',
  'org.uk',
  'com.au',
  'net.au',
  'co.nz',
  'com.br',
  'co.za',
  'com.sg',
  'com.mx',
]

export function normalizeCustomDomain(raw: string): string {
  let value = raw.trim().toLowerCase()
  value = value.replace(/^https?:\/\//, '')
  value = value.replace(/\/.*$/, '')
  value = value.replace(/\.$/, '')
  value = value.split(':')[0]
  return value
}

export function assertAssignableCustomDomain(hostname: string): void {
  if (!HOSTNAME_RE.test(hostname)) {
    throw new AppError(
      400,
      'Enter a valid domain like shop.yourbrand.com',
      'INVALID_DOMAIN'
    )
  }

  const base = getPublicStorefrontBaseDomain().toLowerCase()
  if (hostname === base || hostname.endsWith(`.${base}`)) {
    throw new AppError(
      400,
      `Use your own domain. ${base} subdomains are assigned automatically.`,
      'RESERVED_DOMAIN'
    )
  }

  const reserved = new Set(['localhost', 'aishopy.io', 'www.aishopy.io', 'app.aishopy.io', 'api.aishopy.io'])
  if (reserved.has(hostname)) {
    throw new AppError(400, 'This domain cannot be used', 'RESERVED_DOMAIN')
  }
}

function cnameHostLabel(hostname: string): string {
  const parts = hostname.toLowerCase().split('.')
  const suffix = MULTI_PART_SUFFIXES.find((item) => hostname.toLowerCase().endsWith(`.${item}`))
  const registrableLength = suffix ? suffix.split('.').length + 1 : 2
  if (parts.length <= registrableLength) return '@'
  return parts[0]
}

function dnsRecordFor(hostname: string): { dns_type: 'A' | 'CNAME'; dns_name: string; dns_value: string } {
  const dns_name = cnameHostLabel(hostname)
  if (dns_name === '@') {
    return { dns_type: 'A', dns_name, dns_value: VERCEL_APEX_A }
  }
  return { dns_type: 'CNAME', dns_name, dns_value: storefrontCnameTarget() }
}

export function toCustomDomainView(store: Store): CustomDomainView {
  const status = store.custom_domain
    ? ((store.custom_domain_status as CustomDomainView['status']) ?? 'pending')
    : 'none'
  return {
    subdomain: `${store.slug}.${getPublicStorefrontBaseDomain()}`,
    custom_domain: store.custom_domain ?? null,
    status,
    verified_at: store.custom_domain_verified_at ?? null,
    cname_host: store.custom_domain ? cnameHostLabel(store.custom_domain) : 'shop',
    cname_target: storefrontCnameTarget(),
    ...(store.custom_domain
      ? dnsRecordFor(store.custom_domain)
      : { dns_type: 'CNAME' as const, dns_name: 'shop', dns_value: storefrontCnameTarget() }),
  }
}

async function requireOwnedStore(userId: string, storeId: number): Promise<Store> {
  const store = await storeStaffRepository.resolveOwnedStore(userId, storeId)
  await storeRepository.assertStoreOwner(store.id, userId)
  if (!hasPremiumAccess(store)) {
    throw new AppError(403, 'Custom domain requires a Business plan', 'PREMIUM_REQUIRED')
  }
  return store
}

async function dnsPointsAtStorefront(hostname: string): Promise<boolean> {
  const target = storefrontCnameTarget()
  const base = getPublicStorefrontBaseDomain()
  try {
    const records = await resolveCname(hostname)
    if (
      records.some((record) => {
        const value = record.replace(/\.$/, '').toLowerCase()
        return value === target || value === base || value.endsWith(`.${base}`)
      })
    ) {
      return true
    }
  } catch {
    // Apex domains use an A record. A missing CNAME is expected.
  }
  try {
    const addresses = await resolve4(hostname)
    return addresses.includes(VERCEL_APEX_A)
  } catch {
    return false
  }
}

export async function getCustomDomain(userId: string, storeId: number): Promise<CustomDomainView> {
  const store = await requireOwnedStore(userId, storeId)
  return toCustomDomainView(store)
}

export async function setCustomDomain(
  userId: string,
  storeId: number,
  domainInput: string
): Promise<CustomDomainView> {
  const store = await requireOwnedStore(userId, storeId)
  const hostname = normalizeCustomDomain(domainInput)
  assertAssignableCustomDomain(hostname)

  const existing = await storeRepository.findActiveStoreByCustomDomain(hostname)
  if (existing && existing.id !== store.id) {
    throw new AppError(409, 'This domain is already connected to another store', 'DOMAIN_EXISTS')
  }

  if (store.custom_domain && store.custom_domain !== hostname) {
    await removeVercelProjectDomain(store.custom_domain).catch((err) => {
      console.warn('[custom-domain] previous Vercel domain remove failed', err)
    })
  }

  await addVercelProjectDomain(hostname)
  const updated = await storeRepository.updateStoreCustomDomain(store.id, {
    custom_domain: hostname,
    custom_domain_status: 'pending',
    custom_domain_verified_at: null,
  })
  return toCustomDomainView(updated)
}

export async function verifyCustomDomain(
  userId: string,
  storeId: number
): Promise<CustomDomainView> {
  const store = await requireOwnedStore(userId, storeId)
  if (!store.custom_domain) {
    throw new AppError(400, 'Add a custom domain first', 'DOMAIN_NOT_SET')
  }

  await addVercelProjectDomain(store.custom_domain)
  const pointed = await dnsPointsAtStorefront(store.custom_domain)
  const updated = await storeRepository.updateStoreCustomDomain(store.id, {
    custom_domain: store.custom_domain,
    custom_domain_status: pointed ? 'active' : 'pending',
    custom_domain_verified_at: pointed ? new Date().toISOString() : null,
  })
  return toCustomDomainView(updated)
}

export async function removeCustomDomain(
  userId: string,
  storeId: number
): Promise<CustomDomainView> {
  const store = await requireOwnedStore(userId, storeId)
  if (store.custom_domain) {
    await removeVercelProjectDomain(store.custom_domain).catch((err) => {
      console.warn('[custom-domain] Vercel domain remove failed', err)
    })
  }
  const updated = await storeRepository.updateStoreCustomDomain(store.id, {
    custom_domain: null,
    custom_domain_status: null,
    custom_domain_verified_at: null,
  })
  return toCustomDomainView(updated)
}

export async function resolveHostToSlug(host: string): Promise<{ slug: string } | null> {
  const hostname = host.split(':')[0].toLowerCase().trim()
  if (!hostname) return null

  const base = env.STOREFRONT_BASE_DOMAIN
  const store =
    (await storeRepository.findActiveStoreByCustomDomain(hostname)) ??
    null

  if (!store) return null
  if (store.custom_domain_status !== 'active') return null
  if (base && (hostname === base || hostname.endsWith(`.${base}`))) return null
  return { slug: store.slug }
}

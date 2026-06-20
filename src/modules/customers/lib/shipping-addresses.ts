import type { StorefrontShippingAddress } from '../../../shared/validations/shipping-address.validation.js'
import type { SavedShippingAddress } from '../types/customer.types.js'

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseAddressId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const parsed = Number(raw)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

export function addressesMatch(
  a: Pick<
    StorefrontShippingAddress,
    'address' | 'city' | 'district' | 'state' | 'postcode'
  >,
  b: Pick<
    StorefrontShippingAddress,
    'address' | 'city' | 'district' | 'state' | 'postcode'
  >
): boolean {
  return (
    normalizePart(a.address) === normalizePart(b.address) &&
    normalizePart(a.city) === normalizePart(b.city) &&
    normalizePart(a.district) === normalizePart(b.district) &&
    normalizePart(a.state) === normalizePart(b.state) &&
    normalizePart(a.postcode) === normalizePart(b.postcode)
  )
}

export function parseSavedShippingAddresses(raw: unknown): SavedShippingAddress[] {
  if (!Array.isArray(raw)) return []
  const result: SavedShippingAddress[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = parseAddressId(row.id)
    if (
      id === null ||
      typeof row.name !== 'string' ||
      typeof row.phone_number !== 'string' ||
      typeof row.address !== 'string' ||
      typeof row.city !== 'string' ||
      typeof row.district !== 'string' ||
      typeof row.state !== 'string' ||
      typeof row.postcode !== 'string'
    ) {
      continue
    }
    result.push({
      id,
      name: row.name,
      phone_number: row.phone_number,
      address: row.address,
      city: row.city,
      district: row.district,
      state: row.state,
      postcode: row.postcode,
      created_at:
        typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    })
  }
  return result
}

export function toSavedShippingAddress(
  input: StorefrontShippingAddress,
  phoneNumber: string
): SavedShippingAddress {
  return {
    id: Date.now(),
    name: input.name.trim(),
    phone_number: phoneNumber,
    address: input.address.trim(),
    city: input.city.trim(),
    district: input.district.trim(),
    state: input.state.trim(),
    postcode: input.postcode.trim(),
    created_at: new Date().toISOString(),
  }
}

export function mergeShippingAddressIfNew(
  existing: SavedShippingAddress[],
  candidate: SavedShippingAddress
): SavedShippingAddress[] {
  const duplicate = existing.some((entry) => addressesMatch(entry, candidate))
  if (duplicate) return existing
  return [...existing, candidate]
}

export function toOrderShippingSnapshot(
  input: StorefrontShippingAddress,
  phoneNumber: string
): Record<string, unknown> {
  return {
    name: input.name.trim(),
    phone_number: phoneNumber,
    whatsapp_number: phoneNumber,
    address: input.address.trim(),
    city: input.city.trim(),
    district: input.district.trim(),
    state: input.state.trim(),
    postcode: input.postcode.trim(),
  }
}

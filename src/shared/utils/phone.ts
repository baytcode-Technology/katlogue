/** Normalize WhatsApp number for storage and lookup. */
export function normalizeWhatsAppNumber(value: string): string {
  return value.replace(/\s+/g, '').replace(/^\+/, '')
}

/** Display phone for notifications when no saved name exists. */
export function formatWhatsAppDisplayNumber(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return value
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

const COUNTRY_DIAL: Record<string, string> = {
  India: '91',
  IN: '91',
}

export function isPlaceholderNumber(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('offline-') || trimmed.startsWith('ig:')
}

export function phoneDigits(value: string): string {
  if (isPlaceholderNumber(value)) return ''
  return value.replace(/\D/g, '')
}

export function phoneTail(value: string, n = 10): string {
  const digits = phoneDigits(value)
  if (digits.length < n) return digits
  return digits.slice(-n)
}

export function toCanonicalWhatsAppNumber(phone: string, country?: string | null): string {
  if (isPlaceholderNumber(phone)) return normalizeWhatsAppNumber(phone)
  const digits = phoneDigits(phone)
  if (!digits) return normalizeWhatsAppNumber(phone)
  const dial = COUNTRY_DIAL[country?.trim() ?? ''] ?? COUNTRY_DIAL.India
  if (digits.length === 10 && dial) return `${dial}${digits}`
  return digits
}

export function phoneLookupVariants(phone: string, country?: string | null): string[] {
  const digits = phoneDigits(phone)
  if (!digits) return []
  const canonical = toCanonicalWhatsAppNumber(phone, country)
  const tail = phoneTail(phone)
  return [...new Set([canonical, digits, tail].filter(Boolean))]
}

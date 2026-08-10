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

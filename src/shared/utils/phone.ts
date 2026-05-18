/** Normalize WhatsApp number for storage and lookup. */
export function normalizeWhatsAppNumber(value: string): string {
  return value.replace(/\s+/g, '').replace(/^\+/, '')
}

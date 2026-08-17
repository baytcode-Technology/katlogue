const buckets = new Map<string, { tails: Set<string>; resetAt: number }>()

const MAX_TYPED_PHONES = 5
const WINDOW_MS = 60 * 60 * 1000

export function allowTypedPhoneLookup(
  storeId: number,
  conversationId: number,
  phoneTailValue: string,
  trustedTail: string | null
): boolean {
  const tail = phoneTailValue.trim()
  if (!tail) return false
  if (trustedTail && tail === trustedTail) return true

  const key = `${storeId}:${conversationId}`
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { tails: new Set([tail]), resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.tails.has(tail)) return true
  if (entry.tails.size >= MAX_TYPED_PHONES) return false

  entry.tails.add(tail)
  return true
}

const buckets = new Map<string, { count: number; resetAt: number }>()

const MAX_REPLIES_PER_HOUR = 30
const WINDOW_MS = 60 * 60 * 1000

export function checkInboxAiRateLimit(storeId: number, customerKey: string): boolean {
  const key = `${storeId}:${customerKey}`
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= MAX_REPLIES_PER_HOUR) {
    return false
  }

  entry.count += 1
  return true
}

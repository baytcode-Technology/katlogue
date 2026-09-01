const buckets = new Map<number, { count: number; resetAt: number }>()

const MAX_PREVIEWS_PER_HOUR = 20
const WINDOW_MS = 60 * 60 * 1000

export function checkInboxAiPreviewRateLimit(storeId: number): boolean {
  const now = Date.now()
  const entry = buckets.get(storeId)

  if (!entry || now > entry.resetAt) {
    buckets.set(storeId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= MAX_PREVIEWS_PER_HOUR) {
    return false
  }

  entry.count += 1
  return true
}

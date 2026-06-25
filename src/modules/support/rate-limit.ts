const SUPPORT_MESSAGE_LIMIT_PER_HOUR = 20;
const windowMs = 60 * 60 * 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkSupportRateLimit(storeId: number): void {
  const key = String(storeId);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= SUPPORT_MESSAGE_LIMIT_PER_HOUR) {
    const err = new Error('Support message rate limit exceeded. Please try again later.');
    (err as Error & { code: string }).code = 'RATE_LIMIT_EXCEEDED';
    throw err;
  }

  existing.count += 1;
}

export const SUPPORT_MAX_MESSAGE_LENGTH = 2000;

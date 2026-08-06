type PendingJob = {
  timeout: ReturnType<typeof setTimeout>
  messageId: number
}

const pending = new Map<string, PendingJob>()

const DEBOUNCE_MS = 2500

export function scheduleDebouncedInboxAi(
  key: string,
  messageId: number,
  run: () => Promise<void>
): void {
  const existing = pending.get(key)
  if (existing) {
    clearTimeout(existing.timeout)
  }

  const timeout = setTimeout(() => {
    pending.delete(key)
    void run().catch((err) => {
      console.error('[inbox-ai] debounced job failed', err)
    })
  }, DEBOUNCE_MS)

  pending.set(key, { timeout, messageId })
}

export function getDebouncedMessageId(key: string): number | null {
  return pending.get(key)?.messageId ?? null
}

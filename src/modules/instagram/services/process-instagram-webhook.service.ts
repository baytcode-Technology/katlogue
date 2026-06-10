type InstagramWebhookBody = {
  object?: string
  entry?: Array<Record<string, unknown>>
}

/** Handle Instagram webhook events (DMs, comments, etc.). Persistence wired in a later pass. */
export async function processInstagramWebhook(body: unknown): Promise<void> {
  const payload = body as InstagramWebhookBody

  if (payload.object && payload.object !== 'instagram') {
    console.info('[instagram webhook] ignored object=%s', payload.object)
    return
  }

  const entryCount = payload.entry?.length ?? 0
  console.info('[instagram webhook] received entries=%d', entryCount)

  for (const entry of payload.entry ?? []) {
    if (entry.messaging) {
      console.info('[instagram webhook] messaging batch', JSON.stringify(entry.messaging).slice(0, 400))
    }
    if (entry.changes) {
      console.info('[instagram webhook] changes batch', JSON.stringify(entry.changes).slice(0, 400))
    }
  }
}

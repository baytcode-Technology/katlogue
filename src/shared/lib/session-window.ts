import { AppError } from '../errors/app.error.js'

const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

/** Allow the send when there is no inbound timestamp. Reject only after 24 hours. */
export function assertWithinMessagingWindow(input: {
  lastInboundAt: string | null
  expiredMessage: string
  expiredCode: string
}): void {
  if (!input.lastInboundAt) return

  const elapsed = Date.now() - new Date(input.lastInboundAt).getTime()
  if (elapsed > MESSAGING_WINDOW_MS) {
    throw new AppError(403, input.expiredMessage, input.expiredCode)
  }
}

import crypto from 'crypto'
import { AppError } from '../errors/app.error.js'

/** Meta GET /webhook verification (WhatsApp, Instagram, etc.). */
export function verifyMetaWebhookSubscribe(input: {
  mode: string
  token: string
  challenge: string
  verifyToken: string | undefined
  notConfiguredMessage?: string
}): string {
  if (!input.verifyToken) {
    throw new AppError(
      503,
      input.notConfiguredMessage ?? 'Webhook verify token is not configured on this server',
      'WEBHOOK_NOT_CONFIGURED'
    )
  }

  if (input.mode === 'subscribe' && input.token === input.verifyToken) {
    return input.challenge
  }

  throw new AppError(403, 'Webhook verification failed', 'WEBHOOK_FORBIDDEN')
}

/** Verify Meta `x-hub-signature-256` when app secret is configured. */
export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): void {
  if (!appSecret) return

  const signature = signatureHeader?.trim()
  if (!signature?.startsWith('sha256=')) {
    throw new AppError(401, 'Missing webhook signature', 'WEBHOOK_SIGNATURE_MISSING')
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const actual = signature.slice('sha256='.length)

  if (expected.length !== actual.length) {
    throw new AppError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID')
  }

  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  if (!ok) {
    throw new AppError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID')
  }
}

/** Try each secret until one matches (Meta may sign with app secret vs product secret). */
export function verifyMetaWebhookSignatureAny(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecrets: Array<string | undefined>
): void {
  const secrets = appSecrets.map((s) => s?.trim()).filter((s): s is string => Boolean(s))
  if (secrets.length === 0) return

  let lastError: AppError | null = null
  for (const secret of secrets) {
    try {
      verifyMetaWebhookSignature(rawBody, signatureHeader, secret)
      return
    } catch (err) {
      if (err instanceof AppError && err.code === 'WEBHOOK_SIGNATURE_INVALID') {
        lastError = err
        continue
      }
      throw err
    }
  }

  throw lastError ?? new AppError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID')
}

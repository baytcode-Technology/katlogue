import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function assertIsPublicPaymentProofUrl(url: string, storeId: number): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError(400, 'Invalid payment proof URL', 'INVALID_PAYMENT_PROOF_URL')
  }

  const bucket = env.SUPABASE_STORAGE_BUCKET
  const expectedPrefix = `/storage/v1/object/public/${bucket}/`
  if (!parsed.pathname.startsWith(expectedPrefix)) {
    throw new AppError(400, 'Payment proof URL must be a public storage URL', 'INVALID_PAYMENT_PROOF_URL')
  }

  const pathAfterPrefix = parsed.pathname.slice(expectedPrefix.length)
  const expectedPathPrefix = `${storeId}/payment-proofs/`
  if (!pathAfterPrefix.startsWith(expectedPathPrefix)) {
    throw new AppError(400, 'Payment proof does not belong to this store', 'INVALID_PAYMENT_PROOF_URL')
  }

  const dot = parsed.pathname.lastIndexOf('.')
  if (dot === -1) return
  const ext = parsed.pathname.slice(dot).toLowerCase()
  if (ALLOWED_EXT.has(ext)) return

  throw new AppError(400, 'Payment proof file type not allowed', 'INVALID_PAYMENT_PROOF_URL')
}

export function assertPaymentProofUrlForStore(
  paymentProofUrl: string,
  storeId: number
): void {
  if (!paymentProofUrl || typeof paymentProofUrl !== 'string') {
    throw new AppError(400, 'Payment proof URL is required', 'PAYMENT_PROOF_REQUIRED')
  }
  assertIsPublicPaymentProofUrl(paymentProofUrl, storeId)
}


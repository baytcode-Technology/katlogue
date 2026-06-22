import { createHash } from 'crypto'
import { decryptPaymentSecret, encryptPaymentSecret, maskSecret } from '../../../shared/lib/payment-encryption.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  MerchantPaymentConfigView,
  PublicPaymentMethods,
  RazorpayMode,
  StoredPaymentConfig,
  UpdatePaymentConfigInput,
} from '../types/payment-config.types.js'
import type { PaymentMethod } from '../../orders/types/order.types.js'

export const DEFAULT_STORED_PAYMENT_CONFIG: StoredPaymentConfig = {
  cod: { enabled: true },
  razorpay: { enabled: false, mode: 'test' },
  upi: { enabled: false },
}

function razorpayMode(stored: StoredPaymentConfig): RazorpayMode {
  return stored.razorpay?.mode === 'live' ? 'live' : 'test'
}

export function computeRazorpayVerificationFingerprint(stored: StoredPaymentConfig): string | null {
  const keyId = stored.razorpay?.key_id?.trim()
  if (!keyId) return null

  const { webhook_secret } = getDecryptedRazorpaySecrets(stored)
  if (!webhook_secret) return null

  const mode = razorpayMode(stored)
  return createHash('sha256').update(`${keyId}|${mode}|${webhook_secret}`).digest('hex')
}

export function isRazorpayGrandfathered(stored: StoredPaymentConfig): boolean {
  const rz = stored.razorpay
  if (!rz?.enabled) return false
  if (!rz.key_id || !rz.key_secret_encrypted) return false
  return !rz.verification_fingerprint && !rz.verified_at
}

export function isRazorpayVerifiedForMode(stored: StoredPaymentConfig): boolean {
  if (isRazorpayGrandfathered(stored)) return true

  const rz = stored.razorpay
  if (!rz?.verified_at || !rz.verified_mode || !rz.verification_fingerprint) return false

  const currentMode = razorpayMode(stored)
  if (rz.verified_mode !== currentMode) return false

  const fingerprint = computeRazorpayVerificationFingerprint(stored)
  return fingerprint !== null && fingerprint === rz.verification_fingerprint
}

export function isRazorpayTestRequired(stored: StoredPaymentConfig): boolean {
  if (isRazorpayGrandfathered(stored)) return false
  return Boolean(stored.razorpay?.key_id && stored.razorpay?.key_secret_encrypted)
}

function clearRazorpayVerification(razorpay: StoredPaymentConfig['razorpay']) {
  return {
    ...razorpay,
    verified_at: null,
    verified_mode: null,
    verification_fingerprint: null,
  }
}

export function parseStoredPaymentConfig(raw: unknown): StoredPaymentConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_STORED_PAYMENT_CONFIG }
  }
  const src = raw as StoredPaymentConfig
  return {
    cod: { enabled: src.cod?.enabled ?? true },
    razorpay: {
      enabled: src.razorpay?.enabled ?? false,
      key_id: src.razorpay?.key_id,
      key_secret_encrypted: src.razorpay?.key_secret_encrypted,
      webhook_secret_encrypted: src.razorpay?.webhook_secret_encrypted,
      mode: razorpayMode(src),
      verified_at: src.razorpay?.verified_at ?? null,
      verified_mode: src.razorpay?.verified_mode ?? null,
      verification_fingerprint: src.razorpay?.verification_fingerprint ?? null,
    },
    upi: {
      enabled: src.upi?.enabled ?? false,
      vpa: src.upi?.vpa,
      display_name: src.upi?.display_name,
      qr_image_url: src.upi?.qr_image_url ?? null,
    },
  }
}

export function toMerchantPaymentConfigView(
  stored: StoredPaymentConfig,
  decryptedSecrets?: { key_secret?: string; webhook_secret?: string }
): MerchantPaymentConfigView {
  const keySecret = decryptedSecrets?.key_secret
  const webhookSecret = decryptedSecrets?.webhook_secret
  const configured = Boolean(
    stored.razorpay?.key_id && stored.razorpay?.key_secret_encrypted
  )
  const testPassed = isRazorpayVerifiedForMode(stored)
  const verifiedMode = stored.razorpay?.verified_mode ?? null

  return {
    cod: { enabled: stored.cod?.enabled ?? true },
    razorpay: {
      enabled: stored.razorpay?.enabled ?? false,
      key_id: stored.razorpay?.key_id ?? null,
      key_secret_masked: maskSecret(keySecret),
      webhook_secret_masked: maskSecret(webhookSecret),
      mode: razorpayMode(stored),
      configured,
      test_passed: testPassed,
      test_passed_mode: testPassed ? verifiedMode : null,
      test_required: isRazorpayTestRequired(stored),
    },
    upi: {
      enabled: stored.upi?.enabled ?? false,
      vpa: stored.upi?.vpa ?? null,
      display_name: stored.upi?.display_name ?? null,
      qr_image_url: stored.upi?.qr_image_url ?? null,
    },
  }
}

export function toPublicPaymentMethods(stored: StoredPaymentConfig): PublicPaymentMethods {
  const razorpayLive =
    Boolean(stored.razorpay?.enabled && stored.razorpay?.key_id) &&
    isRazorpayVerifiedForMode(stored)

  return {
    cod: { enabled: stored.cod?.enabled ?? true },
    razorpay: {
      enabled: razorpayLive,
      key_id: razorpayLive ? (stored.razorpay?.key_id ?? null) : null,
    },
    upi: {
      enabled: Boolean(stored.upi?.enabled && stored.upi?.vpa),
      vpa: stored.upi?.enabled ? (stored.upi?.vpa ?? null) : null,
      display_name: stored.upi?.display_name ?? null,
      qr_image_url: stored.upi?.qr_image_url ?? null,
    },
  }
}

export function mergePaymentConfigUpdate(
  current: StoredPaymentConfig,
  input: UpdatePaymentConfigInput
): StoredPaymentConfig {
  const credentialsChanged =
    (input.razorpay?.key_id !== undefined &&
      input.razorpay.key_id.trim() !== (current.razorpay?.key_id ?? '').trim()) ||
    Boolean(input.razorpay?.key_secret?.trim()) ||
    Boolean(input.razorpay?.webhook_secret?.trim()) ||
    (input.razorpay?.mode !== undefined && input.razorpay.mode !== razorpayMode(current))

  let nextRazorpay: StoredPaymentConfig['razorpay'] = {
    ...current.razorpay,
    ...input.razorpay,
  }

  if (credentialsChanged) {
    nextRazorpay = clearRazorpayVerification(nextRazorpay)
  }

  const next: StoredPaymentConfig = {
    cod: { ...current.cod, ...input.cod },
    razorpay: nextRazorpay,
    upi: { ...current.upi, ...input.upi },
  }

  if (input.razorpay?.key_secret) {
    next.razorpay = {
      ...next.razorpay,
      key_secret_encrypted: encryptPaymentSecret(input.razorpay.key_secret),
    }
  }

  if (input.razorpay?.webhook_secret) {
    next.razorpay = {
      ...next.razorpay,
      webhook_secret_encrypted: encryptPaymentSecret(input.razorpay.webhook_secret),
    }
  }

  if (input.upi?.enabled && input.upi.vpa) {
    next.upi = { ...next.upi, vpa: input.upi.vpa.trim().toLowerCase() }
  }

  return next
}

export function markRazorpayVerified(stored: StoredPaymentConfig): StoredPaymentConfig {
  const fingerprint = computeRazorpayVerificationFingerprint(stored)
  if (!fingerprint) {
    throw new AppError(400, 'Razorpay is not fully configured for verification', 'RAZORPAY_NOT_CONFIGURED')
  }

  return {
    ...stored,
    razorpay: {
      ...stored.razorpay,
      verified_at: new Date().toISOString(),
      verified_mode: razorpayMode(stored),
      verification_fingerprint: fingerprint,
    },
  }
}

export function getDecryptedRazorpaySecrets(stored: StoredPaymentConfig): {
  key_secret: string | null
  webhook_secret: string | null
} {
  let key_secret: string | null = null
  let webhook_secret: string | null = null

  if (stored.razorpay?.key_secret_encrypted) {
    key_secret = decryptPaymentSecret(stored.razorpay.key_secret_encrypted)
  }
  if (stored.razorpay?.webhook_secret_encrypted) {
    webhook_secret = decryptPaymentSecret(stored.razorpay.webhook_secret_encrypted)
  }

  return { key_secret, webhook_secret }
}

export function assertPaymentMethodEnabled(
  stored: StoredPaymentConfig,
  method: PaymentMethod
): void {
  const publicMethods = toPublicPaymentMethods(stored)

  if (method === 'cod' && !publicMethods.cod.enabled) {
    throw new AppError(400, 'Cash on delivery is not enabled for this store', 'PAYMENT_METHOD_DISABLED')
  }
  if (method === 'razorpay' && !publicMethods.razorpay.enabled) {
    throw new AppError(400, 'Razorpay is not enabled for this store', 'PAYMENT_METHOD_DISABLED')
  }
  if (method === 'upi' && !publicMethods.upi.enabled) {
    throw new AppError(400, 'UPI is not enabled for this store', 'PAYMENT_METHOD_DISABLED')
  }
}

export function assertRazorpayKeyMatchesMode(keyId: string, mode: 'test' | 'live'): void {
  const trimmed = keyId.trim()
  const isTestKey = trimmed.startsWith('rzp_test_')
  const isLiveKey = trimmed.startsWith('rzp_live_')

  if (!isTestKey && !isLiveKey) {
    throw new AppError(
      400,
      'Razorpay Key ID must start with rzp_test_ or rzp_live_',
      'RAZORPAY_INVALID_KEY_ID'
    )
  }

  if (mode === 'test' && !isTestKey) {
    throw new AppError(
      400,
      'Test mode requires a Razorpay test Key ID (rzp_test_...)',
      'RAZORPAY_KEY_MODE_MISMATCH'
    )
  }

  if (mode === 'live' && !isLiveKey) {
    throw new AppError(
      400,
      'Live mode requires a Razorpay live Key ID (rzp_live_...). Complete business verification in the Razorpay Dashboard first.',
      'RAZORPAY_KEY_MODE_MISMATCH'
    )
  }
}

export function assertRazorpayConfigured(stored: StoredPaymentConfig): {
  key_id: string
  key_secret: string
} {
  const { key_secret } = getDecryptedRazorpaySecrets(stored)
  const key_id = stored.razorpay?.key_id?.trim()
  if (!key_id || !key_secret) {
    throw new AppError(400, 'Razorpay is not fully configured for this store', 'RAZORPAY_NOT_CONFIGURED')
  }
  return { key_id, key_secret }
}

export function assertRazorpaySetupConfigured(stored: StoredPaymentConfig): {
  key_id: string
  key_secret: string
  webhook_secret: string
} {
  const { key_secret, webhook_secret } = getDecryptedRazorpaySecrets(stored)
  const key_id = stored.razorpay?.key_id?.trim()
  if (!key_id || !key_secret || !webhook_secret) {
    throw new AppError(
      400,
      'Save Razorpay Key ID, Key Secret, and Webhook secret before testing',
      'RAZORPAY_NOT_CONFIGURED'
    )
  }
  return { key_id, key_secret, webhook_secret }
}

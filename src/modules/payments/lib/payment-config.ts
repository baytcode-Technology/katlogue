import { decryptPaymentSecret, encryptPaymentSecret, maskSecret } from '../../../shared/lib/payment-encryption.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  MerchantPaymentConfigView,
  PublicPaymentMethods,
  StoredPaymentConfig,
  UpdatePaymentConfigInput,
} from '../types/payment-config.types.js'
import type { PaymentMethod } from '../../orders/types/order.types.js'

export const DEFAULT_STORED_PAYMENT_CONFIG: StoredPaymentConfig = {
  cod: { enabled: true },
  razorpay: { enabled: false, mode: 'test' },
  upi: { enabled: false },
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
      mode: src.razorpay?.mode === 'live' ? 'live' : 'test',
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

  return {
    cod: { enabled: stored.cod?.enabled ?? true },
    razorpay: {
      enabled: stored.razorpay?.enabled ?? false,
      key_id: stored.razorpay?.key_id ?? null,
      key_secret_masked: maskSecret(keySecret),
      webhook_secret_masked: maskSecret(webhookSecret),
      mode: stored.razorpay?.mode === 'live' ? 'live' : 'test',
      configured,
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
  return {
    cod: { enabled: stored.cod?.enabled ?? true },
    razorpay: {
      enabled: Boolean(stored.razorpay?.enabled && stored.razorpay?.key_id),
      key_id: stored.razorpay?.enabled ? (stored.razorpay?.key_id ?? null) : null,
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
  const next: StoredPaymentConfig = {
    cod: { ...current.cod, ...input.cod },
    razorpay: { ...current.razorpay, ...input.razorpay },
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

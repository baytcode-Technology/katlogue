import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  assertRazorpayKeyMatchesMode,
  getDecryptedRazorpaySecrets,
  isRazorpayVerifiedForMode,
  mergePaymentConfigUpdate,
  parseStoredPaymentConfig,
  toMerchantPaymentConfigView,
} from '../lib/payment-config.js'
import type { MerchantPaymentConfigView, UpdatePaymentConfigInput } from '../types/payment-config.types.js'

export async function getPaymentConfigForOwner(
  ownerId: string,
  storeId: number
): Promise<{ store_id: number; payment_config: MerchantPaymentConfigView }> {
  const match = await storeStaffRepository.findStoreByIdForUser(storeId, ownerId)
  if (!match) {
    throw new AppError(403, 'You do not have access to this store', 'FORBIDDEN')
  }

  const stored = parseStoredPaymentConfig(match.store.payment_config)
  const ownerSecrets =
    match.role === 'owner' ? getDecryptedRazorpaySecrets(stored) : null

  return {
    store_id: match.store.id,
    payment_config: toMerchantPaymentConfigView(
      stored,
      ownerSecrets
        ? {
            key_secret: ownerSecrets.key_secret ?? undefined,
            webhook_secret: ownerSecrets.webhook_secret ?? undefined,
          }
        : undefined
    ),
  }
}

export async function updatePaymentConfigForOwner(
  ownerId: string,
  storeId: number,
  input: UpdatePaymentConfigInput
): Promise<{ store_id: number; payment_config: MerchantPaymentConfigView }> {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

  const current = parseStoredPaymentConfig(store.payment_config)
  const next = mergePaymentConfigUpdate(current, input)

  if (next.upi?.enabled && !next.upi.vpa) {
    throw new AppError(400, 'UPI ID is required when UPI is enabled', 'UPI_VPA_REQUIRED')
  }

  if (next.razorpay?.enabled) {
    const hasKey = Boolean(next.razorpay.key_id && next.razorpay.key_secret_encrypted)
    if (!hasKey && !current.razorpay?.key_secret_encrypted) {
      throw new AppError(
        400,
        'Razorpay Key ID and Key Secret are required when Razorpay is enabled',
        'RAZORPAY_KEYS_REQUIRED'
      )
    }

    const hasWebhook =
      Boolean(next.razorpay.webhook_secret_encrypted) ||
      Boolean(input.razorpay?.webhook_secret?.trim()) ||
      Boolean(current.razorpay?.webhook_secret_encrypted)

    if (!hasWebhook) {
      throw new AppError(
        400,
        'Razorpay webhook secret is required when Razorpay is enabled',
        'RAZORPAY_WEBHOOK_SECRET_REQUIRED'
      )
    }

    const keyId = next.razorpay.key_id?.trim()
    if (keyId) {
      const mode = next.razorpay.mode === 'live' ? 'live' : 'test'
      assertRazorpayKeyMatchesMode(keyId, mode)
    }

    if (!isRazorpayVerifiedForMode(next)) {
      throw new AppError(
        400,
        'Run the ₹1 test payment before enabling Razorpay',
        'RAZORPAY_TEST_REQUIRED'
      )
    }
  }

  const updated = await storeRepository.updatePaymentConfig(store.id, next)
  const stored = parseStoredPaymentConfig(updated.payment_config)
  const secrets = getDecryptedRazorpaySecrets(stored)

  return {
    store_id: updated.id,
    payment_config: toMerchantPaymentConfigView(stored, {
      key_secret: secrets.key_secret ?? undefined,
      webhook_secret: secrets.webhook_secret ?? undefined,
    }),
  }
}

import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  getDecryptedRazorpaySecrets,
  mergePaymentConfigUpdate,
  parseStoredPaymentConfig,
  toMerchantPaymentConfigView,
} from '../lib/payment-config.js'
import type { MerchantPaymentConfigView, UpdatePaymentConfigInput } from '../types/payment-config.types.js'

export async function getPaymentConfigForOwner(
  ownerId: string
): Promise<{ store_id: number; payment_config: MerchantPaymentConfigView }> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found', 'STORE_NOT_FOUND')
  }

  const stored = parseStoredPaymentConfig(store.payment_config)
  const secrets = getDecryptedRazorpaySecrets(stored)

  return {
    store_id: store.id,
    payment_config: toMerchantPaymentConfigView(stored, {
      key_secret: secrets.key_secret ?? undefined,
      webhook_secret: secrets.webhook_secret ?? undefined,
    }),
  }
}

export async function updatePaymentConfigForOwner(
  ownerId: string,
  input: UpdatePaymentConfigInput
): Promise<{ store_id: number; payment_config: MerchantPaymentConfigView }> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found', 'STORE_NOT_FOUND')
  }

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

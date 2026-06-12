import { createHmac, timingSafeEqual } from 'crypto'
import * as orderRepository from '../../orders/repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  getDecryptedRazorpaySecrets,
  parseStoredPaymentConfig,
} from '../lib/payment-config.js'

type RazorpayWebhookPayload = {
  event: string
  payload?: {
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        status?: string
        notes?: Record<string, string>
      }
    }
  }
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  webhookSecret: string
): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function processRazorpayWebhook(rawBody: string, signature: string | undefined): Promise<void> {
  let payload: RazorpayWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload
  } catch {
    throw new AppError(400, 'Invalid webhook payload', 'INVALID_WEBHOOK')
  }

  const paymentEntity = payload.payload?.payment?.entity
  const providerOrderId = paymentEntity?.order_id
  const providerPaymentId = paymentEntity?.id

  if (!providerOrderId) {
    throw new AppError(400, 'Missing Razorpay order id in webhook', 'INVALID_WEBHOOK')
  }

  const payment = await orderRepository.findPaymentByProviderOrderId(providerOrderId)
  if (!payment) {
    throw new AppError(404, 'Payment not found for Razorpay order', 'PAYMENT_NOT_FOUND')
  }

  const store = await storeRepository.findStoreById(payment.store_id)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const stored = parseStoredPaymentConfig(store.payment_config)
  const { webhook_secret } = getDecryptedRazorpaySecrets(stored)
  if (!webhook_secret) {
    throw new AppError(400, 'Webhook secret is not configured for this store', 'WEBHOOK_NOT_CONFIGURED')
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signature, webhook_secret)) {
    throw new AppError(401, 'Invalid Razorpay webhook signature', 'INVALID_WEBHOOK_SIGNATURE')
  }

  if (payment.provider_payment_id && providerPaymentId === payment.provider_payment_id) {
    return
  }

  if (payload.event === 'payment.captured' || paymentEntity?.status === 'captured') {
    await orderRepository.updatePayment(payment.id, {
      status: 'paid',
      provider_payment_id: providerPaymentId ?? payment.provider_payment_id,
      paid_at: new Date().toISOString(),
    })
    await orderRepository.updateOrder(payment.order_id, {
      payment_status: 'paid',
      order_status: 'confirmed',
    })
    return
  }

  if (payload.event === 'payment.failed') {
    await orderRepository.updatePayment(payment.id, {
      status: 'failed',
      provider_payment_id: providerPaymentId ?? payment.provider_payment_id,
    })
  }
}

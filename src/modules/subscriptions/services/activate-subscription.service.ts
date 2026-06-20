import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as checkoutRepository from '../repositories/subscription-checkout.repository.js'
import { computeBusinessExpiry } from '../../../shared/lib/subscription.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { verifyPlatformPaymentSignature } from './platform-razorpay.service.js'

export async function activateSubscriptionFromCheckout(input: {
  checkoutId: number
  providerPaymentId: string
  paidAt?: string
}): Promise<{ store: Awaited<ReturnType<typeof storeRepository.activateBusinessSubscription>> }> {
  const checkout = await checkoutRepository.findCheckoutById(input.checkoutId)
  if (!checkout) {
    throw new AppError(404, 'Subscription checkout not found', 'CHECKOUT_NOT_FOUND')
  }

  if (checkout.status === 'paid' && checkout.provider_payment_id === input.providerPaymentId) {
    const store = await storeRepository.findStoreById(checkout.store_id)
    if (!store) {
      throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
    }
    return { store }
  }

  if (checkout.status === 'paid') {
    const store = await storeRepository.findStoreById(checkout.store_id)
    if (!store) {
      throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
    }
    return { store }
  }

  const store = await storeRepository.findStoreById(checkout.store_id)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const expiresAt = computeBusinessExpiry(store.subscription_expires_at)
  const paidAt = input.paidAt ?? new Date().toISOString()

  await checkoutRepository.updateCheckout(checkout.id, {
    status: 'paid',
    provider_payment_id: input.providerPaymentId,
    paid_at: paidAt,
    period_expires_at: expiresAt,
  })

  const updatedStore = await storeRepository.activateBusinessSubscription(checkout.store_id, expiresAt)
  return { store: updatedStore }
}

export async function activateSubscriptionByProviderOrderId(input: {
  providerOrderId: string
  providerPaymentId: string
  paidAt?: string
}): Promise<void> {
  const checkout = await checkoutRepository.findCheckoutByProviderOrderId(input.providerOrderId)
  if (!checkout) {
    throw new AppError(404, 'Subscription checkout not found', 'CHECKOUT_NOT_FOUND')
  }

  await activateSubscriptionFromCheckout({
    checkoutId: checkout.id,
    providerPaymentId: input.providerPaymentId,
    paidAt: input.paidAt,
  })
}

export async function verifyAndActivateSubscription(input: {
  ownerId: string
  checkoutId: number
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}) {
  const checkout = await checkoutRepository.findCheckoutById(input.checkoutId)
  if (!checkout) {
    throw new AppError(404, 'Subscription checkout not found', 'CHECKOUT_NOT_FOUND')
  }

  if (checkout.owner_id !== input.ownerId) {
    throw new AppError(403, 'You do not have access to this checkout', 'FORBIDDEN')
  }

  if (checkout.provider_order_id !== input.razorpayOrderId) {
    throw new AppError(400, 'Razorpay order does not match checkout', 'INVALID_CHECKOUT')
  }

  const valid = verifyPlatformPaymentSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  })

  if (!valid) {
    throw new AppError(400, 'Invalid Razorpay payment signature', 'INVALID_PAYMENT_SIGNATURE')
  }

  return activateSubscriptionFromCheckout({
    checkoutId: checkout.id,
    providerPaymentId: input.razorpayPaymentId,
  })
}

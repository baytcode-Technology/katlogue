import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as checkoutRepository from '../repositories/subscription-checkout.repository.js'
import { getBusinessCheckoutAmount } from '../../../shared/lib/subscription.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { createPlatformOrder } from './platform-razorpay.service.js'
import { randomBytes } from 'crypto'

export async function createSubscriptionCheckout(ownerId: string) {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const pricing = getBusinessCheckoutAmount(store)
  const receipt = `sub_${randomBytes(8).toString('hex')}`

  const razorpayOrder = await createPlatformOrder({
    amountMinorUnits: pricing.minorUnits,
    currency: pricing.currency,
    receipt,
    notes: {
      store_id: store.id,
      owner_id: ownerId,
      plan: 'business',
    },
  })

  const checkout = await checkoutRepository.insertCheckout({
    store_id: store.id,
    owner_id: ownerId,
    provider_order_id: razorpayOrder.order_id,
    amount: pricing.amount,
    currency: pricing.currency,
    plan: 'business',
  })

  return {
    checkout_id: checkout.id,
    key_id: razorpayOrder.key_id,
    order_id: razorpayOrder.order_id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    plan: 'business' as const,
    store_name: store.name,
  }
}

export async function getSubscriptionCheckoutStatus(ownerId: string, checkoutId: string) {
  const checkout = await checkoutRepository.findCheckoutById(checkoutId)
  if (!checkout) {
    throw new AppError(404, 'Subscription checkout not found', 'CHECKOUT_NOT_FOUND')
  }

  if (checkout.owner_id !== ownerId) {
    throw new AppError(403, 'You do not have access to this checkout', 'FORBIDDEN')
  }

  const store = await storeRepository.findStoreById(checkout.store_id)

  return {
    checkout,
    store,
  }
}

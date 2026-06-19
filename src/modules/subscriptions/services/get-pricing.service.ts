import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as checkoutRepository from '../repositories/subscription-checkout.repository.js'
import { getBusinessPricingQuote } from '../../../shared/lib/subscription.js'
import { AppError } from '../../../shared/errors/app.error.js'

export async function getSubscriptionPricing(ownerId: string) {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const hasPaidBefore = await checkoutRepository.hasPaidCheckoutForStore(store.id)
  const trialEligible = !hasPaidBefore

  return getBusinessPricingQuote(store, trialEligible)
}

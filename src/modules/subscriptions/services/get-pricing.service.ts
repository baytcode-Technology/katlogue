import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as checkoutRepository from '../repositories/subscription-checkout.repository.js'
import { getBusinessPricingQuote } from '../../../shared/lib/subscription.js'

export async function getSubscriptionPricing(ownerId: string, storeId: number) {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

  const hasPaidBefore = await checkoutRepository.hasPaidCheckoutForStore(store.id)
  const trialEligible = !hasPaidBefore

  return getBusinessPricingQuote(store, trialEligible)
}

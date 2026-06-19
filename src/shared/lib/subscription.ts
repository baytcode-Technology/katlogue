import { AppError } from '../errors/app.error.js'
import type { Store } from '../../modules/stores/types/store.types.js'

export type SubscriptionPlan = Store['subscription_plan']

export const FREE_PRODUCT_LIMIT = 20
export const FREE_ORDER_LIMIT = 50

export const BUSINESS_TRIAL_AMOUNT_INR = 99
export const BUSINESS_TRIAL_MINOR_INR = 9900
export const BUSINESS_REGULAR_AMOUNT_INR = 999
export const BUSINESS_REGULAR_MINOR_INR = 99900

export const BUSINESS_TRIAL_AMOUNT_USD = 1
export const BUSINESS_TRIAL_MINOR_USD = 100
export const BUSINESS_REGULAR_AMOUNT_USD = 20
export const BUSINESS_REGULAR_MINOR_USD = 2000

export type BusinessCheckoutAmount = {
  amount: number
  currency: 'INR' | 'USD'
  minorUnits: number
  isTrial: boolean
}

export type BusinessPricingQuote = {
  trial_eligible: boolean
  currency: 'INR' | 'USD'
  charge_amount: number
  charge_minor_units: number
  regular_amount: number
  regular_minor_units: number
  is_trial: boolean
  price_label: string
  compare_at_label: string
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/

export function formatSubscriptionDateOnly(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeSubscriptionDate(expiresAt: string): string {
  const match = DATE_ONLY_RE.exec(expiresAt.trim())
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`
  }

  return formatSubscriptionDateOnly(new Date(expiresAt))
}

export function getSubscriptionExpiryEndMs(expiresAt: string): number {
  const [year, month, day] = normalizeSubscriptionDate(expiresAt).split('-').map(Number)
  return Date.UTC(year, month - 1, day, 23, 59, 59, 999)
}

function addMonthsToSubscriptionDate(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day))
  next.setUTCMonth(next.getUTCMonth() + months)
  return formatSubscriptionDateOnly(next)
}

export function isIndiaStore(store: Pick<Store, 'country'>): boolean {
  return store.country === 'India'
}

export function isPremiumPlan(plan: SubscriptionPlan): boolean {
  return plan === 'business' || plan === 'enterprise'
}

export function isSubscriptionExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return Date.now() > getSubscriptionExpiryEndMs(expiresAt)
}

export function hasPremiumAccess(
  store: Pick<Store, 'subscription_plan' | 'subscription_expires_at'>
): boolean {
  if (!isPremiumPlan(store.subscription_plan)) return false
  return !isSubscriptionExpired(store.subscription_expires_at)
}

export function getBusinessCheckoutAmount(
  store: Pick<Store, 'country'>,
  options?: { trialEligible?: boolean }
): BusinessCheckoutAmount {
  const trialEligible = options?.trialEligible ?? false

  if (isIndiaStore(store)) {
    if (trialEligible) {
      return {
        amount: BUSINESS_TRIAL_AMOUNT_INR,
        currency: 'INR',
        minorUnits: BUSINESS_TRIAL_MINOR_INR,
        isTrial: true,
      }
    }
    return {
      amount: BUSINESS_REGULAR_AMOUNT_INR,
      currency: 'INR',
      minorUnits: BUSINESS_REGULAR_MINOR_INR,
      isTrial: false,
    }
  }

  if (trialEligible) {
    return {
      amount: BUSINESS_TRIAL_AMOUNT_USD,
      currency: 'USD',
      minorUnits: BUSINESS_TRIAL_MINOR_USD,
      isTrial: true,
    }
  }
  return {
    amount: BUSINESS_REGULAR_AMOUNT_USD,
    currency: 'USD',
    minorUnits: BUSINESS_REGULAR_MINOR_USD,
    isTrial: false,
  }
}

export function getBusinessPricingQuote(
  store: Pick<Store, 'country'>,
  trialEligible: boolean
): BusinessPricingQuote {
  const charge = getBusinessCheckoutAmount(store, { trialEligible })
  const regular = getBusinessCheckoutAmount(store, { trialEligible: false })

  if (isIndiaStore(store)) {
    return {
      trial_eligible: trialEligible,
      currency: 'INR',
      charge_amount: charge.amount,
      charge_minor_units: charge.minorUnits,
      regular_amount: regular.amount,
      regular_minor_units: regular.minorUnits,
      is_trial: charge.isTrial,
      price_label: charge.isTrial ? '₹99 / 1st month' : '₹999 / month',
      compare_at_label: '₹999 / month',
    }
  }

  return {
    trial_eligible: trialEligible,
    currency: 'USD',
    charge_amount: charge.amount,
    charge_minor_units: charge.minorUnits,
    regular_amount: regular.amount,
    regular_minor_units: regular.minorUnits,
    is_trial: charge.isTrial,
    price_label: charge.isTrial ? '$1 / 1st month' : '$20 / month',
    compare_at_label: '$20 / month',
  }
}

export function computeBusinessExpiry(currentExpiresAt: string | null): string {
  const today = formatSubscriptionDateOnly(new Date())
  const baseDate =
    currentExpiresAt && !isSubscriptionExpired(currentExpiresAt)
      ? normalizeSubscriptionDate(currentExpiresAt)
      : today

  return addMonthsToSubscriptionDate(baseDate, 1)
}

export function assertPremiumAccess(
  store: Pick<Store, 'subscription_plan' | 'subscription_expires_at'>
): void {
  if (!hasPremiumAccess(store)) {
    throw new AppError(
      403,
      'A Business or Enterprise subscription is required for this feature',
      'SUBSCRIPTION_REQUIRED'
    )
  }
}

export function assertWithinProductLimit(count: number): void {
  if (count >= FREE_PRODUCT_LIMIT) {
    throw new AppError(403, 'You have exceeded your store limit', 'SUBSCRIPTION_LIMIT_REACHED')
  }
}

export function assertWithinMonthlyOrderLimit(monthlyCount: number): void {
  if (monthlyCount >= FREE_ORDER_LIMIT) {
    throw new AppError(403, 'You have exceeded your store limit', 'SUBSCRIPTION_LIMIT_REACHED')
  }
}

export function hasExceededFreeStorefrontLimits(
  productCount: number,
  monthlyOrderCount: number
): boolean {
  return productCount >= FREE_PRODUCT_LIMIT && monthlyOrderCount >= FREE_ORDER_LIMIT
}

export function assertStorefrontAvailable(
  store: Pick<Store, 'subscription_plan' | 'subscription_expires_at' | 'product_count'>,
  counts: { monthlyOrderCount: number }
): void {
  if (hasPremiumAccess(store)) return

  const productCount = store.product_count ?? 0
  if (hasExceededFreeStorefrontLimits(productCount, counts.monthlyOrderCount)) {
    throw new AppError(
      403,
      'This store has reached the free plan limit. Upgrade to Business to continue.',
      'STOREFRONT_LIMIT_REACHED'
    )
  }
}

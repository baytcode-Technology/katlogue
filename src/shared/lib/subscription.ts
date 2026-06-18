import { AppError } from '../errors/app.error.js'
import type { Store } from '../../modules/stores/types/store.types.js'

export type SubscriptionPlan = Store['subscription_plan']

export const FREE_PRODUCT_LIMIT = 20
export const FREE_ORDER_LIMIT = 50

export type BusinessCheckoutAmount = {
  amount: number
  currency: 'INR' | 'USD'
  minorUnits: number
}

export function isIndiaStore(store: Pick<Store, 'country'>): boolean {
  return store.country === 'India'
}

export function isPremiumPlan(plan: SubscriptionPlan): boolean {
  return plan === 'business' || plan === 'enterprise'
}

export function isSubscriptionExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

export function hasPremiumAccess(
  store: Pick<Store, 'subscription_plan' | 'subscription_expires_at'>
): boolean {
  if (!isPremiumPlan(store.subscription_plan)) return false
  return !isSubscriptionExpired(store.subscription_expires_at)
}

export function getBusinessCheckoutAmount(store: Pick<Store, 'country'>): BusinessCheckoutAmount {
  if (isIndiaStore(store)) {
    return { amount: 999, currency: 'INR', minorUnits: 99900 }
  }
  return { amount: 20, currency: 'USD', minorUnits: 2000 }
}

export function computeBusinessExpiry(currentExpiresAt: string | null): string {
  const now = Date.now()
  const baseMs =
    currentExpiresAt && new Date(currentExpiresAt).getTime() > now
      ? new Date(currentExpiresAt).getTime()
      : now
  const next = new Date(baseMs)
  next.setMonth(next.getMonth() + 1)
  return next.toISOString()
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

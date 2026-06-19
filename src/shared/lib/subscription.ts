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

export function getBusinessCheckoutAmount(store: Pick<Store, 'country'>): BusinessCheckoutAmount {
  if (isIndiaStore(store)) {
    return { amount: 999, currency: 'INR', minorUnits: 99900 }
  }
  return { amount: 20, currency: 'USD', minorUnits: 2000 }
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

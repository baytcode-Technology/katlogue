import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  InsertSubscriptionCheckoutRow,
  SubscriptionCheckout,
  SubscriptionCheckoutStatus,
} from '../types/subscription-checkout.types.js'

export async function insertCheckout(row: InsertSubscriptionCheckoutRow): Promise<SubscriptionCheckout> {
  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .insert({
      store_id: row.store_id,
      owner_id: row.owner_id,
      provider: 'razorpay',
      provider_order_id: row.provider_order_id,
      amount: row.amount,
      currency: row.currency,
      plan: row.plan ?? 'business',
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_CREATE_FAILED')
  }

  return data as SubscriptionCheckout
}

export async function findCheckoutById(checkoutId: number): Promise<SubscriptionCheckout | null> {
  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .select('*')
    .eq('id', checkoutId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_LOOKUP_FAILED')
  }

  return (data as SubscriptionCheckout) ?? null
}

export async function findCheckoutByProviderOrderId(
  providerOrderId: string
): Promise<SubscriptionCheckout | null> {
  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .select('*')
    .eq('provider_order_id', providerOrderId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_LOOKUP_FAILED')
  }

  return (data as SubscriptionCheckout) ?? null
}

export async function updateCheckout(
  checkoutId: number,
  patch: {
    status?: SubscriptionCheckoutStatus
    provider_payment_id?: string | null
    paid_at?: string | null
    period_expires_at?: string | null
  }
): Promise<SubscriptionCheckout> {
  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .update(patch)
    .eq('id', checkoutId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_UPDATE_FAILED')
  }

  return data as SubscriptionCheckout
}

export async function hasPaidCheckoutForStore(storeId: number): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'paid')

  if (error) {
    throw new AppError(400, error.message, 'SUBSCRIPTION_CHECKOUT_LOOKUP_FAILED')
  }

  return (count ?? 0) > 0
}

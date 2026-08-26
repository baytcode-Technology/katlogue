import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { InsertSubscriptionCheckoutRow, SubscriptionCheckout } from '../types/subscription-checkout.types.js'

export async function insertCheckoutWithProvider(
  row: InsertSubscriptionCheckoutRow & { provider: string }
): Promise<SubscriptionCheckout> {
  const { data, error } = await supabaseAdmin
    .from('subscription_checkouts')
    .insert({
      store_id: row.store_id,
      owner_id: row.owner_id,
      provider: row.provider,
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

export async function findProcessedRevenueCatEvent(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('revenuecat_webhook_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'REVENUECAT_EVENT_LOOKUP_FAILED')
  }

  return Boolean(data)
}

export async function markRevenueCatEventProcessed(input: {
  eventId: string
  eventType: string
  appUserId?: string | null
  storeId?: number | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('revenuecat_webhook_events').upsert(
    {
      event_id: input.eventId,
      event_type: input.eventType,
      app_user_id: input.appUserId ?? null,
      store_id: input.storeId ?? null,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  )

  if (error) {
    throw new AppError(400, error.message, 'REVENUECAT_EVENT_SAVE_FAILED')
  }
}

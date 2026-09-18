import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  StoreWebPushSubscription,
  UpsertWebPushSubscriptionInput,
} from '../types/notification.types.js'

export async function upsertWebPushSubscription(
  storeId: number,
  userId: string,
  input: UpsertWebPushSubscriptionInput
): Promise<StoreWebPushSubscription> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('store_web_push_subscriptions')
    .upsert(
      {
        store_id: storeId,
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        updated_at: now,
      },
      { onConflict: 'endpoint' }
    )
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'WEB_PUSH_UPSERT_FAILED')
  }

  return data as StoreWebPushSubscription
}

export async function findWebPushSubscriptionsByStoreId(
  storeId: number
): Promise<StoreWebPushSubscription[]> {
  const { data, error } = await supabaseAdmin
    .from('store_web_push_subscriptions')
    .select('*')
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'WEB_PUSH_LOOKUP_FAILED')
  }

  return (data ?? []) as StoreWebPushSubscription[]
}

export async function deleteWebPushSubscriptionForStoreUser(
  storeId: number,
  userId: string,
  endpoint: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('store_web_push_subscriptions')
    .delete()
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'WEB_PUSH_DELETE_FAILED')
  }

  return (data?.length ?? 0) > 0
}

export async function deleteWebPushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('store_web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[web-push] Failed to delete stale subscription', error.message)
  }
}

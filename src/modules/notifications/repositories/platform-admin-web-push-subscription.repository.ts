import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  PlatformAdminWebPushSubscription,
  UpsertWebPushSubscriptionInput,
} from '../types/notification.types.js'

export async function upsertPlatformAdminWebPushSubscription(
  userId: string,
  input: UpsertWebPushSubscriptionInput
): Promise<PlatformAdminWebPushSubscription> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('platform_admin_web_push_subscriptions')
    .upsert(
      {
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
    throw new AppError(400, error.message, 'ADMIN_WEB_PUSH_UPSERT_FAILED')
  }

  return data as PlatformAdminWebPushSubscription
}

export async function findPlatformAdminWebPushSubscriptionsByUserIds(
  userIds: string[]
): Promise<PlatformAdminWebPushSubscription[]> {
  if (userIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('platform_admin_web_push_subscriptions')
    .select('*')
    .in('user_id', userIds)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'ADMIN_WEB_PUSH_LOOKUP_FAILED')
  }

  return (data ?? []) as PlatformAdminWebPushSubscription[]
}

export async function deletePlatformAdminWebPushSubscriptionForUser(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('platform_admin_web_push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'ADMIN_WEB_PUSH_DELETE_FAILED')
  }

  return (data?.length ?? 0) > 0
}

export async function deletePlatformAdminWebPushSubscriptionByEndpoint(
  endpoint: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('platform_admin_web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[admin-web-push] Failed to delete stale subscription', error.message)
  }
}

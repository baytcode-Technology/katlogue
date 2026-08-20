import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { StorePushToken, UpsertPushTokenInput } from '../types/notification.types.js'

export async function upsertPushToken(
  storeId: number,
  userId: string,
  input: UpsertPushTokenInput
): Promise<StorePushToken> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('store_push_tokens')
    .upsert(
      {
        store_id: storeId,
        user_id: userId,
        expo_push_token: input.expo_push_token,
        platform: input.platform,
        sound_channel_id: input.sound_channel_id ?? null,
        updated_at: now,
      },
      { onConflict: 'expo_push_token' }
    )
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'PUSH_TOKEN_UPSERT_FAILED')
  }

  return data as StorePushToken
}

export async function findPushTokensByStoreId(storeId: number): Promise<StorePushToken[]> {
  const { data, error } = await supabaseAdmin
    .from('store_push_tokens')
    .select('*')
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'PUSH_TOKEN_LOOKUP_FAILED')
  }

  return (data ?? []) as StorePushToken[]
}

export async function deletePushTokenForStoreUser(
  storeId: number,
  userId: string,
  expoPushToken: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('store_push_tokens')
    .delete()
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('expo_push_token', expoPushToken)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'PUSH_TOKEN_DELETE_FAILED')
  }

  return (data?.length ?? 0) > 0
}

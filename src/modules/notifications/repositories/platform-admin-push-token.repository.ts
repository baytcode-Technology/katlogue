import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { PushTokenPlatform, UpsertPushTokenInput } from '../types/notification.types.js'

export type PlatformAdminPushToken = {
  id: number
  user_id: string
  expo_push_token: string
  platform: PushTokenPlatform
  sound_channel_id: string | null
  created_at: string
  updated_at: string
}

export async function upsertPlatformAdminPushToken(
  userId: string,
  input: UpsertPushTokenInput
): Promise<PlatformAdminPushToken> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('platform_admin_push_tokens')
    .upsert(
      {
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
    throw new AppError(400, error.message, 'ADMIN_PUSH_TOKEN_UPSERT_FAILED')
  }

  return data as PlatformAdminPushToken
}

export async function findPlatformAdminPushTokensByUserIds(
  userIds: string[]
): Promise<PlatformAdminPushToken[]> {
  if (userIds.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('platform_admin_push_tokens')
    .select('*')
    .in('user_id', userIds)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'ADMIN_PUSH_TOKEN_LOOKUP_FAILED')
  }

  return (data ?? []) as PlatformAdminPushToken[]
}

export async function deletePlatformAdminPushTokenForUser(
  userId: string,
  expoPushToken: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('platform_admin_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', expoPushToken)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'ADMIN_PUSH_TOKEN_DELETE_FAILED')
  }

  return (data?.length ?? 0) > 0
}

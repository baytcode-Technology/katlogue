import { z } from 'zod'

const soundIdSchema = z.enum([
  'default',
  'chime',
  'bell',
  'ping',
  'alert',
  'soft',
  'bright',
  'pulse',
])

export const updateNotificationPreferencesSchema = z.object({
  chats: z.boolean().optional(),
  online_orders: z.boolean().optional(),
  pos_orders: z.boolean().optional(),
  sound_id: soundIdSchema.optional(),
})

export type UpdateNotificationPreferencesBody = z.infer<
  typeof updateNotificationPreferencesSchema
>

export const upsertPushTokenSchema = z.object({
  expo_push_token: z.string().trim().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android', 'web']),
  sound_channel_id: z.string().trim().optional(),
})

export type UpsertPushTokenBody = z.infer<typeof upsertPushTokenSchema>

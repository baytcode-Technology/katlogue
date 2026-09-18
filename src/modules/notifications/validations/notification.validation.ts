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

export const deletePushTokenSchema = z.object({
  expo_push_token: z.string().trim().min(1, 'Push token is required'),
})

export type DeletePushTokenBody = z.infer<typeof deletePushTokenSchema>

export const upsertWebPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url('Invalid push endpoint'),
  keys: z.object({
    p256dh: z.string().trim().min(1, 'p256dh key is required'),
    auth: z.string().trim().min(1, 'auth key is required'),
  }),
})

export type UpsertWebPushSubscriptionBody = z.infer<typeof upsertWebPushSubscriptionSchema>

export const deleteWebPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url('Invalid push endpoint'),
})

export type DeleteWebPushSubscriptionBody = z.infer<typeof deleteWebPushSubscriptionSchema>

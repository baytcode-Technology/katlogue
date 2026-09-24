export type NotificationSoundId =
  | 'default'
  | 'chime'
  | 'bell'
  | 'ping'
  | 'alert'
  | 'soft'
  | 'bright'
  | 'pulse'

export type StoredNotificationPreferences = {
  chats: boolean
  online_orders: boolean
  pos_orders: boolean
  sound_id: NotificationSoundId
}

export type NotificationPreferencesView = StoredNotificationPreferences

export type UpdateNotificationPreferencesInput = {
  chats?: boolean
  online_orders?: boolean
  pos_orders?: boolean
  sound_id?: NotificationSoundId
}

export type PushTokenPlatform = 'ios' | 'android' | 'web'

export type StorePushToken = {
  id: number
  store_id: number
  user_id: string
  expo_push_token: string
  platform: PushTokenPlatform
  sound_channel_id: string | null
  created_at: string
  updated_at: string
}

export type UpsertPushTokenInput = {
  expo_push_token: string
  platform: PushTokenPlatform
  sound_channel_id?: string
}

export type StoreWebPushSubscription = {
  id: number
  store_id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  updated_at: string
}

export type PlatformAdminWebPushSubscription = {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  updated_at: string
}

export type UpsertWebPushSubscriptionInput = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export type StoreNotificationKind =
  | 'chat_whatsapp'
  | 'chat_instagram'
  | 'chat_support'
  | 'order_online'
  | 'order_pos'

export type PlatformAdminNotificationKind =
  | 'ticket_raised'
  | 'support_message'
  | 'user_signed_up'

export type SendStoreNotificationInput = {
  storeId: number
  kind: StoreNotificationKind
  title: string
  body: string
  data?: Record<string, string>
}

export type SendPlatformAdminNotificationInput = {
  kind: PlatformAdminNotificationKind
  title: string
  body: string
  data?: Record<string, string>
  /** When true, SW may set requireInteraction */
  important?: boolean
}

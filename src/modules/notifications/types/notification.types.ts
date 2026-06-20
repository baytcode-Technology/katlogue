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

export type StoreNotificationKind =
  | 'chat_whatsapp'
  | 'chat_instagram'
  | 'order_online'
  | 'order_pos'

export type SendStoreNotificationInput = {
  storeId: number
  kind: StoreNotificationKind
  title: string
  body: string
  data?: Record<string, string>
}

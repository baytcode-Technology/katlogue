import type {
  NotificationSoundId,
  StoredNotificationPreferences,
  UpdateNotificationPreferencesInput,
} from '../types/notification.types.js'

export const DEFAULT_NOTIFICATION_PREFERENCES: StoredNotificationPreferences = {
  chats: true,
  online_orders: true,
  pos_orders: true,
  sound_id: 'default',
}

const SOUND_IDS = new Set<NotificationSoundId>([
  'default',
  'chime',
  'bell',
  'ping',
  'alert',
  'soft',
  'bright',
  'pulse',
])

export function parseStoredNotificationPreferences(
  raw: unknown
): StoredNotificationPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }

  const src = raw as Partial<StoredNotificationPreferences>
  const soundId = src.sound_id
  return {
    chats: src.chats ?? true,
    online_orders: src.online_orders ?? true,
    pos_orders: src.pos_orders ?? true,
    sound_id:
      soundId && SOUND_IDS.has(soundId as NotificationSoundId)
        ? (soundId as NotificationSoundId)
        : 'default',
  }
}

export function mergeNotificationPreferencesUpdate(
  current: StoredNotificationPreferences,
  input: UpdateNotificationPreferencesInput
): StoredNotificationPreferences {
  const next: StoredNotificationPreferences = { ...current }

  if (input.chats !== undefined) next.chats = input.chats
  if (input.online_orders !== undefined) next.online_orders = input.online_orders
  if (input.pos_orders !== undefined) next.pos_orders = input.pos_orders
  if (input.sound_id !== undefined) {
    next.sound_id = SOUND_IDS.has(input.sound_id) ? input.sound_id : current.sound_id
  }

  return next
}

export function shouldSendNotification(
  prefs: StoredNotificationPreferences,
  kind: import('../types/notification.types.js').StoreNotificationKind
): boolean {
  switch (kind) {
    case 'chat_whatsapp':
    case 'chat_instagram':
    case 'chat_support':
      return prefs.chats
    case 'order_online':
      return prefs.online_orders
    case 'order_pos':
      return prefs.pos_orders
    default:
      return false
  }
}

export function soundFileForId(soundId: NotificationSoundId): string {
  if (soundId === 'default') return 'default'
  return `${soundId}.wav`
}

export function androidChannelForSound(soundId: NotificationSoundId): string {
  return `aishopy-${soundId}`
}

import * as storeRepository from '../../stores/repositories/store.repository.js'
import {
  androidChannelForSound,
  parseStoredNotificationPreferences,
  shouldSendNotification,
  soundFileForId,
} from '../lib/notification-preferences.js'
import * as pushTokenRepository from '../repositories/push-token.repository.js'
import type { SendStoreNotificationInput } from '../types/notification.types.js'

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  sound?: string
  channelId?: string
  data?: Record<string, string>
  priority?: 'default' | 'normal' | 'high'
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return

  const chunks: ExpoPushMessage[][] = []
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!res.ok) {
        console.error('[push] Expo API error', res.status, await res.text())
      }
    } catch (err) {
      console.error('[push] Expo API request failed', err)
    }
  }
}

export async function sendStoreNotification(input: SendStoreNotificationInput): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) return

  const prefs = parseStoredNotificationPreferences(store.notification_preferences)
  if (!shouldSendNotification(prefs, input.kind)) return

  const tokens = await pushTokenRepository.findPushTokensByStoreId(input.storeId)
  if (tokens.length === 0) return

  const sound = soundFileForId(prefs.sound_id)
  const channelId = androidChannelForSound(prefs.sound_id)

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token.expo_push_token,
    title: input.title,
    body: input.body,
    sound,
    channelId: token.platform === 'android' ? (token.sound_channel_id ?? channelId) : undefined,
    data: input.data,
    priority: 'high',
  }))

  await sendExpoPush(messages)
}

export async function notifyWhatsAppChat(input: {
  storeId: string
  storeSlug: string
  conversationId: string
  preview: string
  fromNumber: string
}): Promise<void> {
  const body = input.preview.trim() || 'New message'
  await sendStoreNotification({
    storeId: input.storeId,
    kind: 'chat_whatsapp',
    title: 'WhatsApp',
    body: `${input.fromNumber}: ${body}`,
    data: {
      type: 'chat',
      channel: 'whatsapp',
      conversationId: input.conversationId,
      storeSlug: input.storeSlug,
    },
  })
}

export async function notifyInstagramChat(input: {
  storeId: string
  storeSlug: string
  conversationId: string
  preview: string
  username?: string | null
}): Promise<void> {
  const sender = input.username ? `@${input.username.replace(/^@/, '')}` : 'Instagram user'
  const body = input.preview.trim() || 'New message'
  await sendStoreNotification({
    storeId: input.storeId,
    kind: 'chat_instagram',
    title: 'Instagram',
    body: `${sender}: ${body}`,
    data: {
      type: 'chat',
      channel: 'instagram',
      conversationId: input.conversationId,
      storeSlug: input.storeSlug,
    },
  })
}

export async function notifyNewOrder(input: {
  storeId: string
  storeSlug: string
  orderId: string
  orderNumber: string
  total: number
  currency: string
  source: string
}): Promise<void> {
  if (input.source !== 'storefront' && input.source !== 'offline') {
    return
  }

  const isOnline = input.source === 'storefront'
  const kind = isOnline ? 'order_online' : 'order_pos'
  const label = isOnline ? 'New online order' : 'POS order'
  const formattedTotal = `${input.currency} ${Number(input.total).toFixed(2)}`

  await sendStoreNotification({
    storeId: input.storeId,
    kind,
    title: input.storeSlug,
    body: `${label} · ${input.orderNumber} · ${formattedTotal}`,
    data: {
      type: 'order',
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      source: input.source,
      storeSlug: input.storeSlug,
    },
  })
}

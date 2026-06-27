import * as storeRepository from '../../stores/repositories/store.repository.js'
import {
  parseStoredNotificationPreferences,
  shouldSendNotification,
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

  const sound = 'default'
  const channelId = 'aishopy-alerts'

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
  storeId: number
  storeSlug: string
  conversationId: number
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
      conversationId: String(input.conversationId),
      storeSlug: input.storeSlug,
    },
  })
}

export async function notifyInstagramChat(input: {
  storeId: number
  storeSlug: string
  conversationId: number
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
      conversationId: String(input.conversationId),
      storeSlug: input.storeSlug,
    },
  })
}

export async function notifySupportChat(input: {
  storeId: number
  storeSlug: string
  conversationId: number
  preview: string
}): Promise<void> {
  const body = input.preview.trim() || 'New message'
  await sendStoreNotification({
    storeId: input.storeId,
    kind: 'chat_support',
    title: 'AiShopy team',
    body,
    data: {
      type: 'support',
      channel: 'support',
      conversationId: String(input.conversationId),
      storeSlug: input.storeSlug,
    },
  })
}

export async function notifyNewOrder(input: {
  storeId: number
  storeSlug: string
  orderId: number
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
  const orderLabel = input.orderNumber

  await sendStoreNotification({
    storeId: input.storeId,
    kind,
    title: input.storeSlug,
    body: `${label} · ${orderLabel} · ${formattedTotal}`,
    data: {
      type: 'order',
      orderId: String(input.orderId),
      orderNumber: input.orderNumber,
      source: input.source,
      storeSlug: input.storeSlug,
    },
  })
}

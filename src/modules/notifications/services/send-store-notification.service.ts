import * as storeRepository from '../../stores/repositories/store.repository.js'
import {
  parseStoredNotificationPreferences,
  shouldSendNotification,
} from '../lib/notification-preferences.js'
import { sendExpoPush, type ExpoPushMessage } from '../lib/expo-push-send.js'
import { sendWebPushToSubscriptions } from '../lib/web-push-send.js'
import * as pushTokenRepository from '../repositories/push-token.repository.js'
import * as webPushRepository from '../repositories/web-push-subscription.repository.js'
import type { SendStoreNotificationInput } from '../types/notification.types.js'

export async function sendStoreNotification(input: SendStoreNotificationInput): Promise<void> {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) return

  const prefs = parseStoredNotificationPreferences(store.notification_preferences)
  if (!shouldSendNotification(prefs, input.kind)) return

  const tokens = await pushTokenRepository.findPushTokensByStoreId(input.storeId)

  // Web-push table may be missing until migration 059 is applied. Never block Expo.
  let webSubscriptions: Awaited<
    ReturnType<typeof webPushRepository.findWebPushSubscriptionsByStoreId>
  > = []
  try {
    webSubscriptions = await webPushRepository.findWebPushSubscriptionsByStoreId(input.storeId)
  } catch (err) {
    console.warn('[web-push] lookup failed — continuing with Expo only', err)
  }

  if (tokens.length === 0 && webSubscriptions.length === 0) return

  if (tokens.length > 0) {
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

  if (webSubscriptions.length > 0) {
    try {
      await sendWebPushToSubscriptions(webSubscriptions, {
        title: input.title,
        body: input.body,
        data: input.data,
      })
    } catch (err) {
      console.warn('[web-push] send failed — Expo already attempted', err)
    }
  }
}

export async function notifyWhatsAppChat(input: {
  storeId: number
  storeSlug: string
  conversationId: number
  preview: string
  senderLabel: string
  customerPhone?: string | null
}): Promise<void> {
  const body = input.preview.trim() || 'New message'
  const phone = input.customerPhone?.trim() || ''
  await sendStoreNotification({
    storeId: input.storeId,
    kind: 'chat_whatsapp',
    title: 'WhatsApp',
    body: `${input.senderLabel}: ${body}`,
    data: {
      type: 'chat',
      channel: 'whatsapp',
      conversationId: String(input.conversationId),
      storeSlug: input.storeSlug,
      ...(phone ? { phone } : {}),
    },
  })
}

export async function notifyInstagramChat(input: {
  storeId: number
  storeSlug: string
  conversationId: number
  preview: string
  username?: string | null
  customerIgId?: string | null
}): Promise<void> {
  const sender = input.username ? `@${input.username.replace(/^@/, '')}` : 'Instagram user'
  const body = input.preview.trim() || 'New message'
  const phone = input.customerIgId?.trim() || ''
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
      ...(phone ? { phone } : {}),
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

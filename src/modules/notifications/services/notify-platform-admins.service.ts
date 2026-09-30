import { getPlatformAdminUserIds } from '../../../shared/lib/platform-admin.js'
import { sendExpoPush } from '../lib/expo-push-send.js'
import { sendWebPushToSubscriptions } from '../lib/web-push-send.js'
import * as adminPushTokenRepository from '../repositories/platform-admin-push-token.repository.js'
import * as adminWebPushRepository from '../repositories/platform-admin-web-push-subscription.repository.js'
import type { SendPlatformAdminNotificationInput } from '../types/notification.types.js'

export async function notifyPlatformAdmins(
  input: SendPlatformAdminNotificationInput
): Promise<void> {
  const adminIds = getPlatformAdminUserIds()
  if (adminIds.length === 0) return

  const data: Record<string, string> = {
    type: input.kind,
    ...(input.data ?? {}),
  }
  if (input.important) {
    data.important = '1'
  }

  let tokens: Awaited<
    ReturnType<typeof adminPushTokenRepository.findPlatformAdminPushTokensByUserIds>
  > = []
  try {
    tokens = await adminPushTokenRepository.findPlatformAdminPushTokensByUserIds(adminIds)
  } catch (err) {
    console.warn('[push] admin Expo lookup failed — continuing with web-push', err)
  }

  let subscriptions: Awaited<
    ReturnType<typeof adminWebPushRepository.findPlatformAdminWebPushSubscriptionsByUserIds>
  > = []
  try {
    subscriptions =
      await adminWebPushRepository.findPlatformAdminWebPushSubscriptionsByUserIds(adminIds)
  } catch (err) {
    console.warn('[web-push] admin lookup failed — skipping browser admin alerts', err)
  }

  if (tokens.length === 0 && subscriptions.length === 0) return

  if (tokens.length > 0) {
    await sendExpoPush(
      tokens.map((token) => ({
        to: token.expo_push_token,
        title: input.title,
        body: input.body,
        sound: 'default',
        channelId: token.platform === 'android' ? (token.sound_channel_id ?? 'aishopy-alerts') : undefined,
        data,
        priority: 'high',
      }))
    )
  }

  if (subscriptions.length > 0) {
    try {
      await sendWebPushToSubscriptions(subscriptions, {
        title: input.title,
        body: input.body,
        data,
      })
    } catch (err) {
      console.warn('[web-push] admin send failed — Expo already attempted', err)
    }
  }
}

export async function notifyPlatformAdminsTicketRaised(input: {
  conversationId: number
  ticketCode: string
  storeName?: string | null
}): Promise<void> {
  const storeLabel = input.storeName?.trim() || 'A store'
  await notifyPlatformAdmins({
    kind: 'ticket_raised',
    title: `New ticket ${input.ticketCode}`,
    body: `${storeLabel} raised a support ticket`,
    important: true,
    data: {
      conversationId: String(input.conversationId),
      ticketCode: input.ticketCode,
      tag: `ticket-${input.conversationId}-${input.ticketCode}`,
    },
  })
}

export async function notifyPlatformAdminsSupportMessage(input: {
  conversationId: number
  messageId: number
  ticketCode?: string | null
  preview: string
  storeName?: string | null
}): Promise<void> {
  const storeLabel = input.storeName?.trim() || 'Store'
  const preview = input.preview.trim() || 'New message'
  const ticket = input.ticketCode?.trim()
  await notifyPlatformAdmins({
    kind: 'support_message',
    title: ticket ? `Support · ${ticket}` : 'Support message',
    body: `${storeLabel}: ${preview.slice(0, 120)}`,
    important: false,
    data: {
      conversationId: String(input.conversationId),
      ...(ticket ? { ticketCode: ticket } : {}),
      tag: `support-${input.conversationId}-${input.messageId}`,
    },
  })
}

export async function notifyPlatformAdminsUserSignedUp(input: {
  userId: string
  email?: string
}): Promise<void> {
  const email = input.email?.trim() || 'New user'
  await notifyPlatformAdmins({
    kind: 'user_signed_up',
    title: 'New user signed up',
    body: email,
    important: true,
    data: {
      userId: input.userId,
    },
  })
}

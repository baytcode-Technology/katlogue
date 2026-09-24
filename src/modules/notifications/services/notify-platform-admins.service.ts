import { getPlatformAdminUserIds } from '../../../shared/lib/platform-admin.js'
import { sendWebPushToSubscriptions } from '../lib/web-push-send.js'
import * as adminWebPushRepository from '../repositories/platform-admin-web-push-subscription.repository.js'
import type { SendPlatformAdminNotificationInput } from '../types/notification.types.js'

export async function notifyPlatformAdmins(
  input: SendPlatformAdminNotificationInput
): Promise<void> {
  const adminIds = getPlatformAdminUserIds()
  if (adminIds.length === 0) return

  const subscriptions =
    await adminWebPushRepository.findPlatformAdminWebPushSubscriptionsByUserIds(adminIds)
  if (subscriptions.length === 0) return

  const data: Record<string, string> = {
    type: input.kind,
    ...(input.data ?? {}),
  }
  if (input.important) {
    data.important = '1'
  }

  await sendWebPushToSubscriptions(subscriptions, {
    title: input.title,
    body: input.body,
    data,
  })
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
    },
  })
}

export async function notifyPlatformAdminsSupportMessage(input: {
  conversationId: number
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
      tag: `support-${input.conversationId}`,
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

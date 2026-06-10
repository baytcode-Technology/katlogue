import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'

type InstagramMessagingEvent = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
  }
}

type InstagramWebhookBody = {
  object?: string
  entry?: Array<{
    id?: string
    messaging?: InstagramMessagingEvent[]
  }>
}

function parseMessagingEvents(body: unknown): Array<{
  recipientIgId: string
  senderIgId: string
  metaMessageId: string
  textBody: string | null
  timestamp: string
  raw: InstagramMessagingEvent
}> {
  const payload = body as InstagramWebhookBody
  const results: Array<{
    recipientIgId: string
    senderIgId: string
    metaMessageId: string
    textBody: string | null
    timestamp: string
    raw: InstagramMessagingEvent
  }> = []

  if (payload.object && payload.object !== 'instagram') return results

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderIgId = event.sender?.id?.trim()
      const recipientIgId = event.recipient?.id?.trim()
      const metaMessageId = event.message?.mid?.trim()

      if (!senderIgId || !recipientIgId || !metaMessageId || !event.message) continue

      const rawTs = event.timestamp ?? 0
      const ms = rawTs > 0 && rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs
      const ts = ms > 0 ? new Date(ms).toISOString() : new Date().toISOString()

      results.push({
        recipientIgId,
        senderIgId,
        metaMessageId,
        textBody: event.message.text?.trim() ?? null,
        timestamp: ts,
        raw: event,
      })
    }
  }

  return results
}

function emitNewMessage(
  storeId: string,
  conversationId: string,
  message: NonNullable<Awaited<ReturnType<typeof chatRepository.insertMessage>>>
) {
  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_MESSAGE_NEW, {
    storeId,
    conversationId,
    message: {
      id: message.id,
      meta_message_id: message.meta_message_id,
      direction: message.direction,
      type: message.type,
      text_body: message.text_body,
      status: message.status,
      timestamp: message.timestamp,
      from_ig_id: message.from_ig_id,
      to_ig_id: message.to_ig_id,
    },
  })
}

function emitConversationUpdated(
  storeId: string,
  conversation: NonNullable<Awaited<ReturnType<typeof chatRepository.upsertConversation>>>
) {
  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId,
    conversation: {
      id: conversation.id,
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: conversation.unread_count,
    },
  })
}

export async function processInstagramWebhook(body: unknown): Promise<void> {
  const events = parseMessagingEvents(body)

  for (const event of events) {
    const isNew = await chatRepository.claimWebhookEvent(event.metaMessageId)
    if (!isNew) continue

    const store = await storeRepository.findStoreByInstagramUserId(event.recipientIgId)
    if (!store) {
      console.info('[instagram webhook] no store for recipient=%s', event.recipientIgId)
      continue
    }

    const customer = await customerRepository.findOrCreateByInstagram(
      store.id,
      event.senderIgId
    )

    const conversation = await chatRepository.upsertConversation({
      storeId: store.id,
      customerIgId: event.senderIgId,
      customerId: customer.id,
      lastMessageAt: event.timestamp,
      lastMessagePreview: event.textBody ?? '[message]',
      incrementUnread: true,
    })

    const saved = await chatRepository.insertMessage({
      storeId: store.id,
      conversationId: conversation.id,
      metaMessageId: event.metaMessageId,
      direction: 'inbound',
      fromIgId: event.senderIgId,
      toIgId: event.recipientIgId,
      type: 'text',
      textBody: event.textBody,
      status: 'received',
      rawPayload: event.raw,
      timestamp: event.timestamp,
    })

    if (!saved) continue

    emitNewMessage(store.id, conversation.id, saved)
    emitConversationUpdated(store.id, conversation)
  }
}

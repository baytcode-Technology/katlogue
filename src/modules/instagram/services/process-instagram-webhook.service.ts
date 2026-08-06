import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { notifyInstagramChat } from '../../notifications/services/send-store-notification.service.js'
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
    is_echo?: boolean
    is_self?: boolean
    attachments?: Array<{ type?: string }>
  }
}

type InstagramWebhookBody = {
  object?: string
  entry?: Array<{
    id?: string
    messaging?: InstagramMessagingEvent[]
    changes?: Array<{
      field?: string
      value?: unknown
    }>
  }>
}

function parseMessagingEvents(body: unknown): Array<{
  entryIgId: string | null
  recipientIgId: string
  senderIgId: string
  metaMessageId: string
  textBody: string | null
  timestamp: string
  raw: InstagramMessagingEvent
}> {
  const payload = body as InstagramWebhookBody
  const results: Array<{
    entryIgId: string | null
    recipientIgId: string
    senderIgId: string
    metaMessageId: string
    textBody: string | null
    timestamp: string
    raw: InstagramMessagingEvent
  }> = []

  const objectType = payload.object
  if (objectType && objectType !== 'instagram' && objectType !== 'page') {
    return results
  }

  for (const entry of payload.entry ?? []) {
    const entryIgId = entry.id?.trim()

    for (const event of entry.messaging ?? []) {
      const senderIgId = event.sender?.id?.trim()
      const recipientIgId = event.recipient?.id?.trim() ?? entryIgId
      const metaMessageId = event.message?.mid?.trim()

      if (!senderIgId || !recipientIgId || !metaMessageId || !event.message) continue

      // Skip echoes of messages we sent via API
      if (event.message.is_echo && !event.message.is_self) continue

      const textBody =
        event.message.text?.trim() ??
        (event.message.attachments?.length
          ? `[${event.message.attachments[0]?.type ?? 'attachment'}]`
          : null)

      const rawTs = event.timestamp ?? 0
      const ms = rawTs > 0 && rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs
      const ts = ms > 0 ? new Date(ms).toISOString() : new Date().toISOString()

      results.push({
        entryIgId: entryIgId ?? null,
        recipientIgId,
        senderIgId,
        metaMessageId,
        textBody,
        timestamp: ts,
        raw: event,
      })
    }
  }

  return results
}

function emitNewMessage(
  storeId: number,
  conversationId: number,
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
  storeId: number,
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

async function resolveStoreForRecipient(input: {
  recipientIgId: string
  entryIgId?: string | null
}) {
  const candidates = [input.recipientIgId, input.entryIgId?.trim()].filter(
    (id): id is string => Boolean(id)
  )
  const seen = new Set<string>()

  for (const igUserId of candidates) {
    if (seen.has(igUserId)) continue
    seen.add(igUserId)

    const store = await storeRepository.findStoreByInstagramUserId(igUserId)
    if (!store) continue

    if (igUserId !== input.recipientIgId) {
      console.info(
        '[instagram webhook] store resolved via entry.id=%s (recipient=%s) store=%s',
        igUserId,
        input.recipientIgId,
        store.id
      )
    }

    return store
  }

  console.info(
    '[instagram webhook] no store for recipient=%s entry=%s',
    input.recipientIgId,
    input.entryIgId ?? 'n/a'
  )
  return null
}

export async function processInstagramWebhook(body: unknown): Promise<void> {
  const events = parseMessagingEvents(body)

  if (events.length > 0) {
    console.info('[instagram webhook] parsed %d messaging event(s)', events.length)
  }

  if (events.length === 0) {
    const payload = body as InstagramWebhookBody
    const summary = JSON.stringify({
      object: payload.object,
      entryCount: payload.entry?.length ?? 0,
      hasMessaging: payload.entry?.some((e) => (e.messaging?.length ?? 0) > 0),
      hasChanges: payload.entry?.some((e) => (e.changes?.length ?? 0) > 0),
    })
    console.info('[instagram webhook] no messaging events parsed %s', summary)
    return
  }

  for (const event of events) {
    console.info(
      '[instagram webhook] event recipient=%s entry=%s sender=%s mid=%s',
      event.recipientIgId,
      event.entryIgId ?? 'n/a',
      event.senderIgId,
      event.metaMessageId
    )

    const isNew = await chatRepository.claimWebhookEvent(event.metaMessageId)
    if (!isNew) continue

    const store = await resolveStoreForRecipient({
      recipientIgId: event.recipientIgId,
      entryIgId: event.entryIgId,
    })
    if (!store) continue

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

    console.info(
      '[instagram webhook] saved inbound message store=%s conversation=%s',
      store.id,
      conversation.id
    )

    emitNewMessage(store.id, conversation.id, saved)
    emitConversationUpdated(store.id, conversation)

    void notifyInstagramChat({
      storeId: store.id,
      storeSlug: store.slug,
      conversationId: conversation.id,
      preview: event.textBody ?? '[message]',
      username: conversation.customer_ig_username,
    }).catch((err) => {
      console.error('[notifications] Instagram push failed', err)
    })
  }
}

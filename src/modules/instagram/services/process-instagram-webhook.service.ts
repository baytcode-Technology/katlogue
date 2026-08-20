import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { notifyInstagramChat } from '../../notifications/services/send-store-notification.service.js'
import { handleInboundInboxAi } from '../../inbox-ai/index.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import type { InstagramMessage } from '../types/instagram-chat.types.js'

type InstagramMessagingEvent = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    is_self?: boolean
    attachments?: Array<{
      type?: string
      payload?: { url?: string; title?: string }
    }>
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

type ParsedAttachment = {
  type: 'image' | 'audio' | 'video' | 'file' | 'share' | 'story_mention' | 'ig_reel' | 'unsupported'
  mediaUrl: string | null
  preview: string
}

function mapAttachmentType(raw: string | undefined): ParsedAttachment['type'] {
  const t = (raw ?? '').toLowerCase()
  if (t === 'image' || t === 'audio' || t === 'video' || t === 'file') return t
  if (t === 'share') return 'share'
  if (t === 'story_mention') return 'story_mention'
  if (t === 'ig_reel' || t === 'reel') return 'ig_reel'
  return 'unsupported'
}

type IgAttachment = {
  type?: string
  payload?: { url?: string; title?: string }
}

function parseAttachment(attachments: IgAttachment[] | undefined): ParsedAttachment | null {
  if (!attachments?.length) return null
  const first = attachments[0]
  const type = mapAttachmentType(first?.type)
  const mediaUrl = first?.payload?.url?.trim() || null
  const label =
    type === 'image'
      ? 'Photo'
      : type === 'video'
        ? 'Video'
        : type === 'audio'
          ? 'Voice message'
          : type === 'file'
            ? 'File'
            : type === 'share'
              ? 'Shared post'
              : type === 'story_mention'
                ? 'Story mention'
                : type === 'ig_reel'
                  ? 'Reel'
                  : 'Attachment'
  return { type, mediaUrl, preview: first?.payload?.title?.trim() || label }
}

function parseMessagingEvents(body: unknown): Array<{
  entryIgId: string | null
  recipientIgId: string
  senderIgId: string
  metaMessageId: string
  textBody: string | null
  messageType: string
  mediaUrl: string | null
  caption: string | null
  preview: string
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
    messageType: string
    mediaUrl: string | null
    caption: string | null
    preview: string
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

      const text = event.message.text?.trim() || null
      const attachment = parseAttachment(event.message.attachments)

      let messageType = 'text'
      let mediaUrl: string | null = null
      let caption: string | null = null
      let textBody = text
      let preview = text || '[message]'

      if (attachment) {
        messageType =
          attachment.type === 'image' ||
          attachment.type === 'audio' ||
          attachment.type === 'video' ||
          attachment.type === 'file'
            ? attachment.type
            : 'text'
        mediaUrl = attachment.mediaUrl
        caption = text
        textBody = text ?? `[${attachment.preview}]`
        preview = text?.trim() || attachment.preview
      }

      const rawTs = event.timestamp ?? 0
      const ms = rawTs > 0 && rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs
      const ts = ms > 0 ? new Date(ms).toISOString() : new Date().toISOString()

      results.push({
        entryIgId: entryIgId ?? null,
        recipientIgId,
        senderIgId,
        metaMessageId,
        textBody,
        messageType,
        mediaUrl,
        caption,
        preview,
        timestamp: ts,
        raw: event,
      })
    }
  }

  return results
}

export function emitInstagramNewMessage(
  storeId: number,
  conversationId: number,
  message: InstagramMessage
) {
  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_MESSAGE_NEW, {
    storeId: Number(storeId),
    conversationId: Number(conversationId),
    message: {
      id: Number(message.id),
      meta_message_id: message.meta_message_id,
      direction: message.direction,
      type: message.type,
      text_body: message.text_body,
      media_id: message.media_id,
      media_url: message.media_url,
      mime_type: message.mime_type,
      caption: message.caption,
      status: message.status,
      timestamp: message.timestamp,
      from_ig_id: message.from_ig_id,
      to_ig_id: message.to_ig_id,
    },
  })
}

export function emitInstagramConversationUpdated(
  storeId: number,
  conversation: NonNullable<Awaited<ReturnType<typeof chatRepository.upsertConversation>>>
) {
  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId: Number(storeId),
    conversation: {
      id: Number(conversation.id),
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: Number(conversation.unread_count ?? 0),
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
      '[instagram webhook] event recipient=%s entry=%s sender=%s mid=%s type=%s',
      event.recipientIgId,
      event.entryIgId ?? 'n/a',
      event.senderIgId,
      event.metaMessageId,
      event.messageType
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
      igUserId: store.ig_user_id?.trim() || event.recipientIgId,
      customerId: customer.id,
      lastMessageAt: event.timestamp,
      lastMessagePreview: event.preview,
      incrementUnread: true,
    })

    const saved = await chatRepository.insertMessage({
      storeId: store.id,
      conversationId: conversation.id,
      metaMessageId: event.metaMessageId,
      direction: 'inbound',
      fromIgId: event.senderIgId,
      toIgId: event.recipientIgId,
      type: event.messageType,
      textBody: event.textBody,
      mediaUrl: event.mediaUrl,
      caption: event.caption,
      status: 'received',
      rawPayload: event.raw,
      timestamp: event.timestamp,
    })

    if (!saved) continue

    console.info(
      '[instagram webhook] saved inbound message store=%s conversation=%s type=%s',
      store.id,
      conversation.id,
      event.messageType
    )

    emitInstagramNewMessage(store.id, conversation.id, saved)
    emitInstagramConversationUpdated(store.id, conversation)

    void notifyInstagramChat({
      storeId: store.id,
      storeSlug: store.slug,
      conversationId: conversation.id,
      preview: event.preview,
      username: conversation.customer_ig_username,
    }).catch((err) => {
      console.error('[notifications] Instagram push failed', err)
    })

    const aiText = event.caption?.trim() || (event.messageType === 'text' ? event.textBody?.trim() : null)
    if (aiText && saved.id) {
      handleInboundInboxAi({
        channel: 'instagram',
        storeId: store.id,
        conversationId: conversation.id,
        messageId: saved.id,
        textBody: aiText,
        customerKey: event.senderIgId,
      })
    }
  }
}

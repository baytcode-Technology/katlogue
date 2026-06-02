import * as customerRepository from '../../customers/repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'
import {
  buildFieldEventKey,
  parseWebhookFieldEvents,
  type WebhookFieldEvent,
} from './coexistence-webhook.service.js'
import { markHistorySyncDeclined } from './coexistence-sync.service.js'
import { markAsRead, resolveStoreWhatsAppCredentials } from './whatsapp.service.js'
import type { ParsedWebhookMessage } from './whatsapp.service.js'

async function persistMessage(input: {
  storeId: string
  store: Awaited<ReturnType<typeof storeRepository.findStoreByWhatsAppWebhookTarget>>
  event: WebhookFieldEvent
  msg: ParsedWebhookMessage
  direction: 'inbound' | 'outbound'
  incrementUnread?: boolean
}) {
  const store = input.store
  if (!store) return null

  const businessNumber = input.event.displayPhoneNumber ?? store.whatsapp_number
  const customerPhone =
    input.direction === 'inbound' ? input.msg.from : input.msg.to ?? input.msg.from

  if (!customerPhone) return null

  const customer = await customerRepository.findOrCreateByWhatsApp(store.id, customerPhone)

  const conversation = await chatRepository.upsertConversation({
    storeId: store.id,
    waPhoneNumberId: input.event.waPhoneNumberId ?? store.wa_phone_number_id ?? 'unknown',
    customerWaNumber: customerPhone,
    customerId: customer.id,
    lastMessageAt: input.msg.timestamp,
    lastMessagePreview: input.msg.textBody ?? `[${input.msg.type}]`,
    incrementUnread: input.incrementUnread,
  })

  return chatRepository.insertMessage({
    storeId: store.id,
    conversationId: conversation.id,
    metaMessageId: input.msg.metaMessageId,
    direction: input.direction,
    fromNumber: input.direction === 'inbound' ? input.msg.from : businessNumber,
    toNumber: input.direction === 'inbound' ? businessNumber : customerPhone,
    type: input.msg.type,
    textBody: input.msg.textBody,
    status: input.direction === 'inbound' ? 'received' : 'sent',
    rawPayload: input.msg.raw,
    timestamp: input.msg.timestamp,
  })
}

function emitNewMessage(
  storeId: string,
  conversationId: string,
  message: NonNullable<Awaited<ReturnType<typeof chatRepository.insertMessage>>>
) {
  emitToStore(storeId, SOCKET_EVENTS.MESSAGE_NEW, {
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
      from_number: message.from_number,
      to_number: message.to_number,
    },
  })
}

export async function processWhatsAppWebhook(body: unknown): Promise<void> {
  const events = parseWebhookFieldEvents(body)

  for (const event of events) {
    const eventKey = buildFieldEventKey(event)
    if (eventKey) {
      const isNew = await chatRepository.claimWebhookEvent(eventKey)
      if (!isNew) continue
    }

    const store = await storeRepository.findStoreByWhatsAppWebhookTarget({
      waPhoneNumberId: event.waPhoneNumberId,
      displayPhoneNumber: event.displayPhoneNumber,
    })

    if (!store) continue

    const credentials = resolveStoreWhatsAppCredentials(store)
    const businessNumber = event.displayPhoneNumber ?? store.whatsapp_number

    // Contact sync
    for (const contact of event.contacts) {
      await customerRepository.findOrCreateByWhatsApp(store.id, contact.phone, {
        name: contact.name ?? undefined,
      })
    }

    if (event.contacts.length > 0) {
      const activeJob = await syncRepository.findActiveSyncJob(store.id, 'smb_app_state_sync')
      if (activeJob) {
        await syncRepository.updateSyncJob({ id: activeJob.id, status: 'completed' })
      }
    }

    // History sync
    if (event.historyDeclined) {
      await markHistorySyncDeclined(store.id)
    }

    for (const msg of event.historyMessages) {
      const saved = await persistMessage({
        storeId: store.id,
        store,
        event,
        msg,
        direction: 'inbound',
      })
      if (saved) emitNewMessage(store.id, saved.conversation_id, saved)
    }

    if (event.historyMessages.length > 0 || event.historyDeclined) {
      const activeJob = await syncRepository.findActiveSyncJob(store.id, 'history')
      if (activeJob) {
        await syncRepository.updateSyncJob({
          id: activeJob.id,
          status: event.historyDeclined ? 'declined' : 'completed',
        })
      }
    }

    // Inbound messages
    for (const msg of event.messages) {
      const saved = await persistMessage({
        storeId: store.id,
        store,
        event,
        msg,
        direction: 'inbound',
        incrementUnread: true,
      })

      if (saved) {
        emitNewMessage(store.id, saved.conversation_id, saved)

        const conversation = await chatRepository.findConversationById({
          storeId: store.id,
          conversationId: saved.conversation_id,
        })

        if (conversation) {
          emitToStore(store.id, SOCKET_EVENTS.CONVERSATION_UPDATED, {
            storeId: store.id,
            conversation: {
              id: conversation.id,
              customer_wa_number: conversation.customer_wa_number,
              last_message_at: conversation.last_message_at,
              last_message_preview: conversation.last_message_preview,
              unread_count: conversation.unread_count,
            },
          })
        }
      }

      if (credentials && msg.type === 'text') {
        void markAsRead({ metaMessageId: msg.metaMessageId, credentials }).catch((err) => {
          console.error('[whatsapp] markAsRead failed', err)
        })
      }
    }

    // Phone app echoes (outbound from Business app)
    for (const msg of event.messageEchoes) {
      const customerPhone = msg.to ?? msg.from
      if (!customerPhone) continue

      const saved = await persistMessage({
        storeId: store.id,
        store,
        event,
        msg: { ...msg, from: businessNumber, to: customerPhone },
        direction: 'outbound',
      })

      if (saved) emitNewMessage(store.id, saved.conversation_id, saved)
    }

    // Delivery statuses
    for (const status of event.statuses) {
      const updated = await chatRepository.updateMessageStatus({
        metaMessageId: status.metaMessageId,
        status: status.status,
      })

      if (!updated) continue

      emitToStore(store.id, SOCKET_EVENTS.MESSAGE_STATUS, {
        storeId: store.id,
        conversationId: updated.conversation_id,
        metaMessageId: updated.meta_message_id,
        status: updated.status,
      })
    }
  }
}

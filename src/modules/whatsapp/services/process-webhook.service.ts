import * as customerRepository from '../../customers/repositories/customer.repository.js'

import * as storeRepository from '../../stores/repositories/store.repository.js'

import { emitToStore } from '../../../websocket/index.js'

import { SOCKET_EVENTS } from '../../../websocket/events.js'

import * as chatRepository from '../repositories/whatsapp-chat.repository.js'

import {

  buildWebhookEventKey,

  markAsRead,

  parseWebhookPayload,

  resolveStoreWhatsAppCredentials,

} from './whatsapp.service.js'



export async function processWhatsAppWebhook(body: unknown): Promise<void> {

  const changes = parseWebhookPayload(body)



  for (const change of changes) {

    const eventKey = buildWebhookEventKey(change)

    if (eventKey) {

      const isNew = await chatRepository.claimWebhookEvent(eventKey)

      if (!isNew) continue

    }



    const store = await storeRepository.findStoreByWhatsAppWebhookTarget({

      waPhoneNumberId: change.waPhoneNumberId,

      displayPhoneNumber: change.displayPhoneNumber,

    })



    if (!store) continue



    const credentials = resolveStoreWhatsAppCredentials(store)

    const businessNumber = change.displayPhoneNumber ?? store.whatsapp_number



    for (const msg of change.messages) {

      const customer = await customerRepository.findOrCreateByWhatsApp(store.id, msg.from)



      const conversation = await chatRepository.upsertConversation({

        storeId: store.id,

        waPhoneNumberId: change.waPhoneNumberId ?? store.wa_phone_number_id ?? 'unknown',

        customerWaNumber: msg.from,

        customerId: customer.id,

        lastMessageAt: msg.timestamp,

        lastMessagePreview: msg.textBody ?? `[${msg.type}]`,

        incrementUnread: true,

      })



      const saved = await chatRepository.insertMessage({

        storeId: store.id,

        conversationId: conversation.id,

        metaMessageId: msg.metaMessageId,

        direction: 'inbound',

        fromNumber: msg.from,

        toNumber: businessNumber,

        type: msg.type,

        textBody: msg.textBody,

        status: 'received',

        rawPayload: msg.raw,

        timestamp: msg.timestamp,

      })



      if (saved) {

        emitToStore(store.id, SOCKET_EVENTS.MESSAGE_NEW, {

          storeId: store.id,

          conversationId: conversation.id,

          message: {

            id: saved.id,

            meta_message_id: saved.meta_message_id,

            direction: saved.direction,

            type: saved.type,

            text_body: saved.text_body,

            status: saved.status,

            timestamp: saved.timestamp,

            from_number: saved.from_number,

            to_number: saved.to_number,

          },

        })



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



      if (credentials && msg.type === 'text') {

        void markAsRead({ metaMessageId: msg.metaMessageId, credentials }).catch((err) => {

          console.error('[whatsapp] markAsRead failed', err)

        })

      }

    }



    for (const status of change.statuses) {

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



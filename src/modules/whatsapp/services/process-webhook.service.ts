import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'

type WebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string }
        messages?: Array<{
          id?: string
          from?: string
          timestamp?: string
          type?: string
          text?: { body?: string }
        }>
      }
    }>
  }>
}

export async function processWhatsAppWebhook(body: unknown): Promise<void> {
  const payload = body as WebhookBody
  const entries = payload.entry ?? []

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      const waPhoneNumberId = value.metadata?.phone_number_id ?? null
      const displayPhoneNumber = value.metadata?.display_phone_number
        ? normalizeWhatsAppNumber(value.metadata.display_phone_number)
        : null

      const store = await storeRepository.findStoreByWhatsAppWebhookTarget({
        waPhoneNumberId,
        displayPhoneNumber,
      })

      // If we can't resolve the store yet, we still ACK the webhook (Meta retries otherwise).
      if (!store) continue

      const messages = value.messages ?? []
      for (const msg of messages) {
        const metaMessageId = msg.id?.trim()
        const from = msg.from ? normalizeWhatsAppNumber(msg.from) : null
        const type = msg.type?.trim() || 'unknown'

        if (!metaMessageId || !from) continue

        const timestamp =
          msg.timestamp && /^\d+$/.test(msg.timestamp)
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : null

        const textBody = type === 'text' ? (msg.text?.body?.trim() ?? null) : null

        const conversation = await chatRepository.upsertConversation({
          storeId: store.id,
          waPhoneNumberId: waPhoneNumberId ?? store.wa_phone_number_id ?? 'unknown',
          customerWaNumber: from,
          lastMessageAt: timestamp,
          lastMessagePreview: textBody ?? `[${type}]`,
        })

        await chatRepository.insertMessage({
          storeId: store.id,
          conversationId: conversation.id,
          metaMessageId,
          direction: 'inbound',
          fromNumber: from,
          toNumber: displayPhoneNumber ?? store.whatsapp_number,
          type,
          textBody,
          rawPayload: msg,
          timestamp,
        })
      }
    }
  }
}


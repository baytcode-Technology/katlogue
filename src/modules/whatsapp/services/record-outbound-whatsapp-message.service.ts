import { AppError } from '../../../shared/errors/app.error.js'
import * as customerRepository from '../../customers/repositories/customer.repository.js'
import type { Store } from '../../stores/types/store.types.js'
import * as chatRepository from '../repositories/whatsapp-chat.repository.js'
import type { WhatsAppConversation, WhatsAppMessage } from '../types/whatsapp-chat.types.js'
import { emitOutboundWhatsAppMessage } from './emit-outbound-message.service.js'
import { resolveBusinessFromNumber } from './whatsapp.service.js'

type RecordOutboundInput = {
  store: Pick<Store, 'id' | 'whatsapp_number' | 'wa_phone_number_id'>
  phoneNumberId: string
  customerWaNumber: string
  metaMessageId: string
  type: string
  textBody: string | null
  preview: string
  mediaId?: string | null
  mimeType?: string | null
  caption?: string | null
  rawPayload: unknown
  duplicate: 'throw' | 'reload'
}

export async function recordOutboundWhatsAppMessage(
  input: RecordOutboundInput & { duplicate: 'throw' }
): Promise<{ conversation: WhatsAppConversation; message: WhatsAppMessage }>
export async function recordOutboundWhatsAppMessage(
  input: RecordOutboundInput & { duplicate: 'reload' }
): Promise<{ conversation: WhatsAppConversation; message: WhatsAppMessage | null }>
export async function recordOutboundWhatsAppMessage(
  input: RecordOutboundInput
): Promise<{ conversation: WhatsAppConversation; message: WhatsAppMessage | null }> {
  const now = new Date().toISOString()
  const customer = await customerRepository.findOrCreateByWhatsApp(
    input.store.id,
    input.customerWaNumber
  )

  const conversation = await chatRepository.upsertConversation({
    storeId: input.store.id,
    waPhoneNumberId: input.phoneNumberId,
    customerWaNumber: input.customerWaNumber,
    customerId: customer.id,
    lastMessageAt: now,
    lastMessagePreview: input.preview,
  })

  const saved = await chatRepository.insertMessage({
    storeId: input.store.id,
    conversationId: conversation.id,
    metaMessageId: input.metaMessageId,
    direction: 'outbound',
    fromNumber: resolveBusinessFromNumber(input.store),
    toNumber: input.customerWaNumber,
    type: input.type,
    textBody: input.textBody,
    mediaId: input.mediaId ?? null,
    mimeType: input.mimeType ?? null,
    caption: input.caption ?? null,
    status: 'sent',
    rawPayload: input.rawPayload,
    timestamp: now,
  })

  const message =
    saved ??
    (input.duplicate === 'reload'
      ? await chatRepository.findMessageByMetaMessageId(input.metaMessageId)
      : null)

  if (!message) {
    if (input.duplicate === 'throw') {
      throw new AppError(500, 'Failed to persist outbound message', 'WHATSAPP_MESSAGE_SAVE_FAILED')
    }
    return { conversation, message: null }
  }

  emitOutboundWhatsAppMessage({ storeId: input.store.id, conversation, message })
  return { conversation, message }
}

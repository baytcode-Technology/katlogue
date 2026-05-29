import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  WhatsAppConversation,
  WhatsAppMessage,
} from '../types/whatsapp-chat.types.js'

export async function upsertConversation(input: {
  storeId: string
  waPhoneNumberId: string
  customerWaNumber: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
}): Promise<WhatsAppConversation> {
  // Supabase upsert needs unique constraint. We use (store_id, customer_wa_number).
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .upsert(
      {
        store_id: input.storeId,
        wa_phone_number_id: input.waPhoneNumberId,
        customer_wa_number: input.customerWaNumber,
        last_message_at: input.lastMessageAt,
        last_message_preview: input.lastMessagePreview,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id,customer_wa_number' }
    )
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATION_UPSERT_FAILED')
  }

  return data as WhatsAppConversation
}

export async function insertMessage(input: {
  storeId: string
  conversationId: string
  metaMessageId: string
  direction: 'inbound' | 'outbound'
  fromNumber: string
  toNumber: string
  type: string
  textBody: string | null
  rawPayload: unknown
  timestamp: string | null
}): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .upsert(
      {
        store_id: input.storeId,
        conversation_id: input.conversationId,
        meta_message_id: input.metaMessageId,
        direction: input.direction,
        from_number: input.fromNumber,
        to_number: input.toNumber,
        type: input.type,
        text_body: input.textBody,
        raw_payload: input.rawPayload as any,
        timestamp: input.timestamp,
      },
      { onConflict: 'meta_message_id', ignoreDuplicates: true }
    )
    .select('*')
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_INSERT_FAILED')
  }

  return (data as WhatsAppMessage) ?? null
}

export async function listConversations(storeId: string): Promise<WhatsAppConversation[]> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('store_id', storeId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATIONS_FETCH_FAILED')
  }

  return (data as WhatsAppConversation[]) ?? []
}

export async function listMessages(input: {
  storeId: string
  conversationId: string
  limit: number
  cursor?: string | null
}): Promise<WhatsAppMessage[]> {
  let query = supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('conversation_id', input.conversationId)
    .order('timestamp', { ascending: false, nullsFirst: false })
    .limit(input.limit)

  if (input.cursor) {
    query = query.lt('timestamp', input.cursor)
  }

  const { data, error } = await query

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_MESSAGES_FETCH_FAILED')
  }

  return (data as WhatsAppMessage[]) ?? []
}


import { supabaseAdmin } from '../../../config/supabase.js'

import { AppError } from '../../../shared/errors/app.error.js'

import type {

  WhatsAppConversation,

  WhatsAppMessage,

  WhatsAppMessageStatus,

} from '../types/whatsapp-chat.types.js'



export async function upsertConversation(input: {

  storeId: string

  waPhoneNumberId: string

  customerWaNumber: string

  customerId?: string | null

  lastMessageAt: string | null

  lastMessagePreview: string | null

  incrementUnread?: boolean

}): Promise<WhatsAppConversation> {

  const { data: existing } = await supabaseAdmin

    .from('whatsapp_conversations')

    .select('id, unread_count')

    .eq('store_id', input.storeId)

    .eq('customer_wa_number', input.customerWaNumber)

    .maybeSingle()



  const unreadCount =

    input.incrementUnread && existing

      ? Number(existing.unread_count ?? 0) + 1

      : input.incrementUnread

        ? 1

        : undefined



  const row: Record<string, unknown> = {

    store_id: input.storeId,

    wa_phone_number_id: input.waPhoneNumberId,

    customer_wa_number: input.customerWaNumber,

    last_message_at: input.lastMessageAt,

    last_message_preview: input.lastMessagePreview,

    updated_at: new Date().toISOString(),

  }



  if (input.customerId) row.customer_id = input.customerId

  if (unreadCount !== undefined) row.unread_count = unreadCount



  const { data, error } = await supabaseAdmin

    .from('whatsapp_conversations')

    .upsert(row, { onConflict: 'store_id,customer_wa_number' })

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

  status?: WhatsAppMessageStatus

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

        status: input.status ?? (input.direction === 'inbound' ? 'received' : 'sent'),

        raw_payload: input.rawPayload as Record<string, unknown>,

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



export async function updateMessageStatus(input: {

  metaMessageId: string

  status: WhatsAppMessageStatus

}): Promise<WhatsAppMessage | null> {

  const { data, error } = await supabaseAdmin

    .from('whatsapp_messages')

    .update({ status: input.status })

    .eq('meta_message_id', input.metaMessageId)

    .select('*')

    .maybeSingle()



  if (error) {

    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_STATUS_UPDATE_FAILED')

  }



  return (data as WhatsAppMessage) ?? null

}



export async function claimWebhookEvent(eventKey: string): Promise<boolean> {

  const { error } = await supabaseAdmin

    .from('whatsapp_webhook_events')

    .insert({ event_key: eventKey })



  if (!error) return true



  if (error.code === '23505') return false



  throw new AppError(400, error.message, 'WHATSAPP_WEBHOOK_EVENT_CLAIM_FAILED')

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



export async function findConversationById(input: {

  storeId: string

  conversationId: string

}): Promise<WhatsAppConversation | null> {

  const { data, error } = await supabaseAdmin

    .from('whatsapp_conversations')

    .select('*')

    .eq('store_id', input.storeId)

    .eq('id', input.conversationId)

    .maybeSingle()



  if (error) {

    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATION_FETCH_FAILED')

  }



  return (data as WhatsAppConversation) ?? null

}



export async function findConversationByCustomer(input: {

  storeId: string

  customerWaNumber: string

}): Promise<WhatsAppConversation | null> {

  const { data, error } = await supabaseAdmin

    .from('whatsapp_conversations')

    .select('*')

    .eq('store_id', input.storeId)

    .eq('customer_wa_number', input.customerWaNumber)

    .maybeSingle()



  if (error) {

    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATION_FETCH_FAILED')

  }



  return (data as WhatsAppConversation) ?? null

}



export async function getLastInboundMessageAt(input: {

  storeId: string

  customerWaNumber: string

}): Promise<string | null> {

  const conversation = await findConversationByCustomer(input)

  if (!conversation) return null



  const { data, error } = await supabaseAdmin

    .from('whatsapp_messages')

    .select('timestamp')

    .eq('store_id', input.storeId)

    .eq('conversation_id', conversation.id)

    .eq('direction', 'inbound')

    .order('timestamp', { ascending: false, nullsFirst: false })

    .limit(1)

    .maybeSingle()



  if (error) {

    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_LOOKUP_FAILED')

  }



  return (data?.timestamp as string | null) ?? null

}



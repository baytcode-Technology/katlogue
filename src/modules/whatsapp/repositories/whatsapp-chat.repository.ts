import { supabaseAdmin } from '../../../config/supabase.js'

import { AppError } from '../../../shared/errors/app.error.js'

import type {

  WhatsAppConversation,

  WhatsAppMessage,

  WhatsAppMessageStatus,

} from '../types/whatsapp-chat.types.js'



export async function upsertConversation(input: {

  storeId: number

  waPhoneNumberId: string

  customerWaNumber: string

  customerId?: number | null

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

  storeId: number

  conversationId: number

  metaMessageId: string

  direction: 'inbound' | 'outbound'

  fromNumber: string

  toNumber: string

  type: string

  textBody: string | null

  mediaId?: string | null

  mimeType?: string | null

  caption?: string | null

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

        media_id: input.mediaId ?? null,

        mime_type: input.mimeType ?? null,

        caption: input.caption ?? null,

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



export async function findMessageByMetaMessageId(
  metaMessageId: string,
): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('meta_message_id', metaMessageId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_FETCH_FAILED')
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



export async function listConversations(storeId: number): Promise<WhatsAppConversation[]> {

  const { data, error } = await supabaseAdmin

    .from('whatsapp_conversations')

    .select('*, customers(name)')

    .eq('store_id', storeId)

    .order('last_message_at', { ascending: false, nullsFirst: false })

    .order('updated_at', { ascending: false })



  if (error) {

    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATIONS_FETCH_FAILED')

  }



  type Row = WhatsAppConversation & {
    customers?: { name: string | null } | { name: string | null }[] | null
  }

  const conversations = ((data as Row[]) ?? []).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
    const { customers: _customers, ...rest } = row
    return {
      ...rest,
      customer_name: customer?.name?.trim() || null,
    } as WhatsAppConversation
  })

  const missingNames = conversations.filter((c) => !c.customer_name)
  if (missingNames.length === 0) return conversations

  const phones = [...new Set(missingNames.map((c) => c.customer_wa_number))]
  const { data: customers, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('whatsapp_number, name')
    .eq('store_id', storeId)
    .in('whatsapp_number', phones)

  if (customerError) {
    return conversations
  }

  const nameByPhone = new Map<string, string>()
  for (const row of customers ?? []) {
    const name = (row as { whatsapp_number: string; name: string | null }).name?.trim()
    if (name) {
      nameByPhone.set((row as { whatsapp_number: string }).whatsapp_number, name)
    }
  }

  return conversations.map((c) =>
    c.customer_name
      ? c
      : { ...c, customer_name: nameByPhone.get(c.customer_wa_number) ?? null }
  )

}



export async function listMessages(input: {

  storeId: number

  conversationId: number

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

  storeId: number

  conversationId: number

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

  storeId: number

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

  storeId: number

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

export async function resetUnreadCount(input: {
  storeId: number
  conversationId: number
}): Promise<WhatsAppConversation> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CONVERSATION_READ_FAILED')
  }

  return data as WhatsAppConversation
}

export async function findMessageByMediaForStore(input: {
  storeId: number
  mediaId: string
}): Promise<WhatsAppMessage | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('media_id', input.mediaId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_MEDIA_LOOKUP_FAILED')
  }

  if (data) return data as WhatsAppMessage

  const mediaKeys = ['image', 'video', 'audio', 'document', 'sticker'] as const
  for (const key of mediaKeys) {
    const { data: fallback, error: fallbackError } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*')
      .eq('store_id', input.storeId)
      .filter(`raw_payload->${key}->>id`, 'eq', input.mediaId)
      .limit(1)
      .maybeSingle()

    if (fallbackError) {
      throw new AppError(400, fallbackError.message, 'WHATSAPP_MESSAGE_MEDIA_LOOKUP_FAILED')
    }

    if (fallback) return fallback as WhatsAppMessage
  }

  return null
}

export async function findMessageById(input: {
  storeId: number
  messageId: number
}) {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('id', input.messageId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_MESSAGE_FETCH_FAILED')
  }

  return (data as WhatsAppMessage) ?? null
}

/**
 * Delete WhatsApp conversations that do not belong to the currently connected
 * phone number id (messages cascade). Keeps current-account threads.
 */
export async function deleteConversationsExceptPhoneNumberId(
  storeId: number,
  currentWaPhoneNumberId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .delete()
    .eq('store_id', storeId)
    .neq('wa_phone_number_id', currentWaPhoneNumberId)
    .select('id')

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_CHAT_HISTORY_CLEAR_FAILED')
  }

  return data?.length ?? 0
}



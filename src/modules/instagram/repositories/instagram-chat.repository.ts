import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type {
  InstagramConversation,
  InstagramMessage,
  InstagramMessageStatus,
} from '../types/instagram-chat.types.js'

export async function upsertConversation(input: {
  storeId: number
  customerIgId: string
  customerIgUsername?: string | null
  customerId?: number | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  incrementUnread?: boolean
}): Promise<InstagramConversation> {
  const { data: existing } = await supabaseAdmin
    .from('instagram_conversations')
    .select('id, unread_count')
    .eq('store_id', input.storeId)
    .eq('customer_ig_id', input.customerIgId)
    .maybeSingle()

  const unreadCount =
    input.incrementUnread && existing
      ? Number(existing.unread_count ?? 0) + 1
      : input.incrementUnread
        ? 1
        : undefined

  const row: Record<string, unknown> = {
    store_id: input.storeId,
    customer_ig_id: input.customerIgId,
    last_message_at: input.lastMessageAt,
    last_message_preview: input.lastMessagePreview,
    updated_at: new Date().toISOString(),
  }

  if (input.customerIgUsername) row.customer_ig_username = input.customerIgUsername
  if (input.customerId) row.customer_id = input.customerId
  if (unreadCount !== undefined) row.unread_count = unreadCount

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('instagram_conversations')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) {
      throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATION_UPSERT_FAILED')
    }

    return data as InstagramConversation
  }

  const { data, error } = await supabaseAdmin
    .from('instagram_conversations')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATION_UPSERT_FAILED')
  }

  return data as InstagramConversation
}

export async function insertMessage(input: {
  storeId: number
  conversationId: number
  metaMessageId: string
  direction: 'inbound' | 'outbound'
  fromIgId: string
  toIgId: string
  type: string
  textBody: string | null
  status?: InstagramMessageStatus
  rawPayload: unknown
  timestamp: string | null
}): Promise<InstagramMessage | null> {
  const { data, error } = await supabaseAdmin
    .from('instagram_messages')
    .upsert(
      {
        store_id: input.storeId,
        conversation_id: input.conversationId,
        meta_message_id: input.metaMessageId,
        direction: input.direction,
        from_ig_id: input.fromIgId,
        to_ig_id: input.toIgId,
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
    throw new AppError(400, error.message, 'INSTAGRAM_MESSAGE_INSERT_FAILED')
  }

  return (data as InstagramMessage) ?? null
}

export async function claimWebhookEvent(eventKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('instagram_webhook_events')
    .insert({ event_key: eventKey })

  if (!error) return true
  if (error.code === '23505') return false
  throw new AppError(400, error.message, 'INSTAGRAM_WEBHOOK_EVENT_CLAIM_FAILED')
}

export async function listConversations(storeId: number): Promise<InstagramConversation[]> {
  const { data, error } = await supabaseAdmin
    .from('instagram_conversations')
    .select('*')
    .eq('store_id', storeId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATIONS_FETCH_FAILED')
  }

  return (data as InstagramConversation[]) ?? []
}

export async function listMessages(input: {
  storeId: number
  conversationId: number
  limit: number
  cursor?: string | null
}): Promise<InstagramMessage[]> {
  let query = supabaseAdmin
    .from('instagram_messages')
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
    throw new AppError(400, error.message, 'INSTAGRAM_MESSAGES_FETCH_FAILED')
  }

  return (data as InstagramMessage[]) ?? []
}

export async function findConversationById(input: {
  storeId: number
  conversationId: number
}): Promise<InstagramConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('instagram_conversations')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATION_FETCH_FAILED')
  }

  return (data as InstagramConversation) ?? null
}

export async function findConversationByCustomer(input: {
  storeId: number
  customerIgId: string
}): Promise<InstagramConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('instagram_conversations')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('customer_ig_id', input.customerIgId)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATION_FETCH_FAILED')
  }

  return (data as InstagramConversation) ?? null
}

export async function getLastInboundMessageAt(input: {
  storeId: number
  customerIgId: string
}): Promise<string | null> {
  const conversation = await findConversationByCustomer(input)
  if (!conversation) return null

  const { data, error } = await supabaseAdmin
    .from('instagram_messages')
    .select('timestamp')
    .eq('store_id', input.storeId)
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound')
    .order('timestamp', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_MESSAGE_LOOKUP_FAILED')
  }

  return (data?.timestamp as string | null) ?? null
}

export async function resetUnreadCount(input: {
  storeId: number
  conversationId: number
}): Promise<InstagramConversation> {
  const { data, error } = await supabaseAdmin
    .from('instagram_conversations')
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('store_id', input.storeId)
    .eq('id', input.conversationId)
    .select('*')
    .single()

  if (error) {
    throw new AppError(400, error.message, 'INSTAGRAM_CONVERSATION_READ_FAILED')
  }

  return data as InstagramConversation
}

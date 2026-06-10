export type InstagramMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received'

export type InstagramConversation = {
  id: string
  store_id: string
  customer_id: string | null
  customer_ig_id: string
  customer_ig_username: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  created_at: string
  updated_at: string
}

export type InstagramMessage = {
  id: string
  store_id: string
  conversation_id: string
  meta_message_id: string
  direction: 'inbound' | 'outbound'
  from_ig_id: string
  to_ig_id: string
  type: string
  text_body: string | null
  status: InstagramMessageStatus
  raw_payload: Record<string, unknown> | null
  timestamp: string | null
  created_at: string
}

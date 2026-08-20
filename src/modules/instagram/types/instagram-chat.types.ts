export type InstagramMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received'

export type InstagramConversation = {
  id: number
  store_id: number
  customer_id: number | null
  customer_ig_id: string
  customer_ig_username: string | null
  ig_user_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  reply_mode: 'ai' | 'manual'
  ai_paused_until: string | null
  created_at: string
  updated_at: string
}

export type InstagramMessage = {
  id: number
  store_id: number
  conversation_id: number
  meta_message_id: string
  direction: 'inbound' | 'outbound'
  from_ig_id: string
  to_ig_id: string
  type: string
  text_body: string | null
  media_id: string | null
  media_url: string | null
  mime_type: string | null
  caption: string | null
  status: InstagramMessageStatus
  raw_payload: Record<string, unknown> | null
  timestamp: string | null
  created_at: string
}

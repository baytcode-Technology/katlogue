export type WhatsAppConversation = {
  id: string
  store_id: string
  wa_phone_number_id: string
  customer_wa_number: string
  last_message_at: string | null
  last_message_preview: string | null
  created_at: string
  updated_at: string
}

export type WhatsAppMessage = {
  id: string
  conversation_id: string
  store_id: string
  meta_message_id: string
  direction: 'inbound' | 'outbound' | string
  from_number: string
  to_number: string
  type: string
  text_body: string | null
  raw_payload: unknown
  timestamp: string | null
  created_at: string
}


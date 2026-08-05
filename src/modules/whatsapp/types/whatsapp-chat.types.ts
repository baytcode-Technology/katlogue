export type WhatsAppMessageStatus =

  | 'pending'

  | 'sent'

  | 'delivered'

  | 'read'

  | 'failed'

  | 'received'



export type WhatsAppConversation = {

  id: number

  store_id: number

  customer_id: number | null

  wa_phone_number_id: string

  customer_wa_number: string

  customer_name: string | null

  last_message_at: string | null

  last_message_preview: string | null

  unread_count: number

  created_at: string

  updated_at: string

}



export type WhatsAppMessage = {

  id: number

  conversation_id: number

  store_id: number

  meta_message_id: string

  direction: 'inbound' | 'outbound' | string

  from_number: string

  to_number: string

  type: string

  text_body: string | null

  status: WhatsAppMessageStatus

  raw_payload: unknown

  timestamp: string | null

  created_at: string

}



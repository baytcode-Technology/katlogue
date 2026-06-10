export const SOCKET_EVENTS = {
  JOIN_STORE: 'store:join',
  MESSAGE_NEW: 'whatsapp:message:new',
  MESSAGE_STATUS: 'whatsapp:message:status',
  CONVERSATION_UPDATED: 'whatsapp:conversation:updated',
  INSTAGRAM_MESSAGE_NEW: 'instagram:message:new',
  INSTAGRAM_CONVERSATION_UPDATED: 'instagram:conversation:updated',
} as const

export type SocketMessagePayload = {
  storeId: string
  conversationId: string
  message: {
    id: string
    meta_message_id: string
    direction: string
    type: string
    text_body: string | null
    status: string
    timestamp: string | null
    from_number: string
    to_number: string
  }
}

export type SocketStatusPayload = {
  storeId: string
  conversationId: string
  metaMessageId: string
  status: string
}

export type SocketConversationPayload = {
  storeId: string
  conversation: {
    id: string
    customer_wa_number: string
    last_message_at: string | null
    last_message_preview: string | null
    unread_count: number
  }
}

export type SocketInstagramMessagePayload = {
  storeId: string
  conversationId: string
  message: {
    id: string
    meta_message_id: string
    direction: string
    type: string
    text_body: string | null
    status: string
    timestamp: string | null
    from_ig_id: string
    to_ig_id: string
  }
}

export type SocketInstagramConversationPayload = {
  storeId: string
  conversation: {
    id: string
    customer_ig_id: string
    customer_ig_username: string | null
    last_message_at: string | null
    last_message_preview: string | null
    unread_count: number
  }
}

export const SOCKET_EVENTS = {
  JOIN_STORE: 'store:join',
  MESSAGE_NEW: 'whatsapp:message:new',
  MESSAGE_STATUS: 'whatsapp:message:status',
  CONVERSATION_UPDATED: 'whatsapp:conversation:updated',
  INSTAGRAM_MESSAGE_NEW: 'instagram:message:new',
  INSTAGRAM_CONVERSATION_UPDATED: 'instagram:conversation:updated',
  ORDER_NEW: 'order:new',
} as const

export type SocketMessagePayload = {
  storeId: number
  conversationId: number
  message: {
    id: number
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
  storeId: number
  conversationId: number
  metaMessageId: string
  status: string
}

export type SocketConversationPayload = {
  storeId: number
  conversation: {
    id: number
    customer_wa_number: string
    last_message_at: string | null
    last_message_preview: string | null
    unread_count: number
  }
}

export type SocketInstagramMessagePayload = {
  storeId: number
  conversationId: number
  message: {
    id: number
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
  storeId: number
  conversation: {
    id: number
    customer_ig_id: string
    customer_ig_username: string | null
    last_message_at: string | null
    last_message_preview: string | null
    unread_count: number
  }
}

export type SocketOrderNewPayload = {
  storeId: number
  order: {
    id: number
    order_number: string
    total: number
    currency: string
    source: string
    store_slug: string
  }
}

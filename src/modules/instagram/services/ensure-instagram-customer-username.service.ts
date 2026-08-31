import type { Store } from '../../stores/types/store.types.js'
import { emitToStore } from '../../../websocket/index.js'
import { SOCKET_EVENTS } from '../../../websocket/events.js'
import * as chatRepository from '../repositories/instagram-chat.repository.js'
import {
  fetchInstagramCustomerProfile,
  resolveStoreInstagramCredentials,
} from './instagram-api.service.js'

function emitConversationUpdated(
  storeId: number,
  conversation: NonNullable<Awaited<ReturnType<typeof chatRepository.findConversationById>>>
): void {
  emitToStore(storeId, SOCKET_EVENTS.INSTAGRAM_CONVERSATION_UPDATED, {
    storeId: Number(storeId),
    conversation: {
      id: Number(conversation.id),
      customer_ig_id: conversation.customer_ig_id,
      customer_ig_username: conversation.customer_ig_username,
      last_message_at: conversation.last_message_at,
      last_message_preview: conversation.last_message_preview,
      unread_count: Number(conversation.unread_count ?? 0),
      reply_mode: conversation.reply_mode,
      ai_paused_until: conversation.ai_paused_until,
    },
  })
}

export async function ensureInstagramCustomerUsername(input: {
  store: Store
  conversationId: number
  customerIgId: string
  existingUsername?: string | null
}): Promise<string | null> {
  const existing = input.existingUsername?.trim().replace(/^@/, '')
  if (existing) return existing

  const credentials = resolveStoreInstagramCredentials(input.store)
  if (!credentials) return null

  const profile = await fetchInstagramCustomerProfile({
    accessToken: credentials.accessToken,
    customerIgId: input.customerIgId,
  })

  const username = profile?.username?.trim().replace(/^@/, '') || null
  if (!username) return null

  const updated = await chatRepository.updateCustomerIgUsername({
    storeId: input.store.id,
    conversationId: input.conversationId,
    username,
  })

  if (updated) {
    emitConversationUpdated(input.store.id, updated)
    return username
  }

  const refreshed = await chatRepository.findConversationById({
    storeId: input.store.id,
    conversationId: input.conversationId,
  })

  if (refreshed?.customer_ig_username) {
    return refreshed.customer_ig_username.trim().replace(/^@/, '')
  }

  return username
}

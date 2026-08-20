import { deleteConversationsByStoreId } from '../repositories/whatsapp-chat.repository.js'

export type ClearWhatsAppChatHistoryResult = {
  storeId: number
  deletedConversations: number
}

/** Permanently delete WhatsApp conversations/messages for a store. Credentials untouched. */
export async function clearWhatsAppChatHistory(
  storeId: number
): Promise<ClearWhatsAppChatHistoryResult> {
  const deletedConversations = await deleteConversationsByStoreId(storeId)

  console.info('[whatsapp][clear-chat-history] completed', {
    storeId,
    deletedConversations,
  })

  return { storeId, deletedConversations }
}

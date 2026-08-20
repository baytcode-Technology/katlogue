import { deleteConversationsByStoreId } from '../repositories/instagram-chat.repository.js'

export type ClearInstagramChatHistoryResult = {
  storeId: number
  deletedConversations: number
}

/** Permanently delete Instagram conversations/messages for a store. Credentials untouched. */
export async function clearInstagramChatHistory(
  storeId: number
): Promise<ClearInstagramChatHistoryResult> {
  const deletedConversations = await deleteConversationsByStoreId(storeId)

  console.info('[instagram][clear-chat-history] completed', {
    storeId,
    deletedConversations,
  })

  return { storeId, deletedConversations }
}

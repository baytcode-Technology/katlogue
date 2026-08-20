import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { deleteConversationsExceptIgUserId } from '../repositories/instagram-chat.repository.js'

export type ClearInstagramChatHistoryResult = {
  storeId: number
  deletedConversations: number
  keptIgUserId: string
}

/**
 * Delete Instagram conversations from previous business accounts only.
 * Current store ig_user_id threads are kept. Credentials untouched.
 */
export async function clearInstagramChatHistory(
  storeId: number
): Promise<ClearInstagramChatHistoryResult> {
  const store = await storeRepository.findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const currentIgUserId = store.ig_user_id?.trim() || null
  if (!currentIgUserId) {
    throw new AppError(
      400,
      'Instagram is not connected for this store',
      'INSTAGRAM_NOT_CONNECTED'
    )
  }

  const deletedConversations = await deleteConversationsExceptIgUserId(
    storeId,
    currentIgUserId
  )

  console.info('[instagram][clear-chat-history] completed', {
    storeId,
    deletedConversations,
    keptIgUserId: currentIgUserId,
  })

  return {
    storeId,
    deletedConversations,
    keptIgUserId: currentIgUserId,
  }
}

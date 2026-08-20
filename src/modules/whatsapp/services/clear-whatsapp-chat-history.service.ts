import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { deleteConversationsExceptPhoneNumberId } from '../repositories/whatsapp-chat.repository.js'

export type ClearWhatsAppChatHistoryResult = {
  storeId: number
  deletedConversations: number
  keptPhoneNumberId: string
}

/**
 * Delete WhatsApp conversations from previous phone numbers only.
 * Current store wa_phone_number_id threads are kept. Credentials untouched.
 */
export async function clearWhatsAppChatHistory(
  storeId: number
): Promise<ClearWhatsAppChatHistoryResult> {
  const store = await storeRepository.findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const currentWaPhoneNumberId = store.wa_phone_number_id?.trim() || null
  if (!currentWaPhoneNumberId) {
    throw new AppError(
      400,
      'WhatsApp is not connected for this store',
      'WHATSAPP_NOT_CONNECTED'
    )
  }

  const deletedConversations = await deleteConversationsExceptPhoneNumberId(
    storeId,
    currentWaPhoneNumberId
  )

  console.info('[whatsapp][clear-chat-history] completed', {
    storeId,
    deletedConversations,
    keptPhoneNumberId: currentWaPhoneNumberId,
  })

  return {
    storeId,
    deletedConversations,
    keptPhoneNumberId: currentWaPhoneNumberId,
  }
}

import { AppError } from '../../../shared/errors/app.error.js';
import { assertStoreMember } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function markMerchantRead(
  ownerId: string,
  storeId: number,
  conversationId: number
) {
  await assertStoreMember(storeId, ownerId);

  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation || Number(conversation.store_id) !== Number(storeId)) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  await supportRepository.markMerchantRead(conversationId);
  const summary = await supportRepository.getMerchantUnreadSummary(storeId);
  return { summary };
}

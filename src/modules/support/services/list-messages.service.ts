import { AppError } from '../../../shared/errors/app.error.js';
import { assertStoreOwner } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function listMessages(
  ownerId: string,
  storeId: number,
  conversationId: number
) {
  await assertStoreOwner(storeId, ownerId);

  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation || conversation.store_id !== storeId) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  const messages = await supportRepository.listMessages(conversationId);
  return { conversation, messages };
}

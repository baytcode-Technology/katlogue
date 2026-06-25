import { AppError } from '../../../shared/errors/app.error.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function listAdminMessages(conversationId: number) {
  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  const messages = await supportRepository.listMessages(conversationId);
  return { conversation, messages };
}

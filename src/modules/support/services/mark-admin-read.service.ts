import { AppError } from '../../../shared/errors/app.error.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function markAdminRead(conversationId: number) {
  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  await supportRepository.markAdminRead(conversationId);
  const summary = await supportRepository.getAdminSummary();
  return { summary };
}

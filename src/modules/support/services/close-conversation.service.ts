import { AppError } from '../../../shared/errors/app.error.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function closeConversation(conversationId: number) {
  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (new Date(conversation.expires_at) <= new Date()) {
    throw new AppError(410, 'This conversation has expired', 'CONVERSATION_EXPIRED');
  }

  const updated = await supportRepository.closeConversation(conversationId);
  return { conversation: updated };
}

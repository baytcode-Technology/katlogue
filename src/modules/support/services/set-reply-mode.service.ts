import { AppError } from '../../../shared/errors/app.error.js';
import type { SupportReplyMode } from '../types/support.types.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function setReplyMode(conversationId: number, replyMode: SupportReplyMode) {
  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (new Date(conversation.expires_at) <= new Date()) {
    throw new AppError(410, 'This conversation has expired', 'CONVERSATION_EXPIRED');
  }

  const wasManual = conversation.reply_mode === 'manual';
  const updated = await supportRepository.setReplyMode(conversationId, replyMode);

  if (replyMode === 'manual' && !wasManual) {
    await supportRepository.insertMessage(
      conversationId,
      'system',
      'AiShopy support team has taken over this ticket.'
    );
  }

  return { conversation: updated };
}

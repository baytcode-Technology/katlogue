import { AppError } from '../../../shared/errors/app.error.js';
import { notifySupportChat } from '../../notifications/services/send-store-notification.service.js';
import { findStoreById } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function adminSendMessage(conversationId: number, content: string) {
  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  if (new Date(conversation.expires_at) <= new Date()) {
    throw new AppError(410, 'This conversation has expired', 'CONVERSATION_EXPIRED');
  }

  if (conversation.status !== 'escalated' || conversation.reply_mode !== 'manual') {
    throw new AppError(
      403,
      'Manual reply is not enabled for this conversation',
      'MANUAL_REPLY_NOT_ENABLED'
    );
  }

  const message = await supportRepository.insertMessage(conversationId, 'admin', content);

  const store = await findStoreById(conversation.store_id);
  if (store?.slug) {
    void notifySupportChat({
      storeId: conversation.store_id,
      storeSlug: store.slug,
      conversationId,
      preview: content,
    }).catch((err) => {
      console.error('[support] push notification failed', err);
    });
  }

  return { message, conversation };
}

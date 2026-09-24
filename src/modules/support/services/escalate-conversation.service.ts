import { AppError } from '../../../shared/errors/app.error.js';
import { notifyPlatformAdminsTicketRaised } from '../../notifications/services/notify-platform-admins.service.js';
import { assertStoreMember, findStoreById } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function escalateConversation(
  ownerId: string,
  storeId: number,
  conversationId: number
) {
  await assertStoreMember(storeId, ownerId);

  const conversation = await supportRepository.getConversationById(conversationId);
  if (!conversation || Number(conversation.store_id) !== Number(storeId)) {
    throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  }

  const wasEscalated = conversation.status === 'escalated' && Boolean(conversation.ticket_code);
  const updated = await supportRepository.escalateConversation(conversationId);

  if (!wasEscalated && updated.ticket_code) {
    const store = await findStoreById(storeId).catch(() => null);
    void notifyPlatformAdminsTicketRaised({
      conversationId: updated.id,
      ticketCode: updated.ticket_code,
      storeName: store?.name,
    }).catch((err) => {
      console.error('[notifications] platform admin ticket push failed', err);
    });
  }

  return updated;
}

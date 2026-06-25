import * as supportRepository from '../repositories/support.repository.js';

export async function cleanupExpiredConversations() {
  const deleted = await supportRepository.deleteExpiredConversations();
  return { deleted };
}

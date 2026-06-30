import { assertStoreMember } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function getOrCreateConversation(ownerId: string, storeId: number) {
  await assertStoreMember(storeId, ownerId);

  const existing = await supportRepository.findActiveConversation(storeId);
  if (existing) {
    return existing;
  }

  return supportRepository.insertConversation(storeId, ownerId);
}

import { assertStoreMember } from '../../stores/repositories/store.repository.js';
import * as supportRepository from '../repositories/support.repository.js';

export async function getMerchantUnread(ownerId: string, storeId: number) {
  await assertStoreMember(storeId, ownerId);
  return supportRepository.getMerchantUnreadSummary(storeId);
}

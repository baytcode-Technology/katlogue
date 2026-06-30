import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as pushTokenRepository from '../repositories/push-token.repository.js'
import type { UpsertPushTokenInput } from '../types/notification.types.js'

export async function registerPushTokenForOwner(
  ownerId: string,
  storeId: number,
  input: UpsertPushTokenInput
): Promise<{ registered: true }> {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

  await pushTokenRepository.upsertPushToken(store.id, ownerId, input)
  return { registered: true }
}
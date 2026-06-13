import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as pushTokenRepository from '../repositories/push-token.repository.js'
import type { UpsertPushTokenInput } from '../types/notification.types.js'

export async function registerPushTokenForOwner(
  ownerId: string,
  input: UpsertPushTokenInput
): Promise<{ registered: true }> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found', 'STORE_NOT_FOUND')
  }

  await pushTokenRepository.upsertPushToken(store.id, ownerId, input)
  return { registered: true }
}

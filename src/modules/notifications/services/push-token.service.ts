import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as pushTokenRepository from '../repositories/push-token.repository.js'
import type { UpsertPushTokenInput } from '../types/notification.types.js'

/** Register Expo push token for an owner or active staff member of the store. */
export async function registerPushTokenForStoreMember(
  userId: string,
  storeId: number,
  input: UpsertPushTokenInput
): Promise<{ registered: true }> {
  await storeStaffRepository.assertStoreMember(storeId, userId)
  await pushTokenRepository.upsertPushToken(storeId, userId, input)
  return { registered: true }
}

/** Remove Expo push token for an owner or active staff member of the store. */
export async function unregisterPushTokenForStoreMember(
  userId: string,
  storeId: number,
  expoPushToken: string
): Promise<{ removed: boolean }> {
  await storeStaffRepository.assertStoreMember(storeId, userId)
  const removed = await pushTokenRepository.deletePushTokenForStoreUser(
    storeId,
    userId,
    expoPushToken
  )
  return { removed }
}

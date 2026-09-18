import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as webPushRepository from '../repositories/web-push-subscription.repository.js'
import type { UpsertWebPushSubscriptionInput } from '../types/notification.types.js'

export async function registerWebPushSubscriptionForStoreMember(
  userId: string,
  storeId: number,
  input: UpsertWebPushSubscriptionInput
): Promise<{ registered: true }> {
  await storeStaffRepository.assertStoreMember(storeId, userId)
  await webPushRepository.upsertWebPushSubscription(storeId, userId, input)
  return { registered: true }
}

export async function unregisterWebPushSubscriptionForStoreMember(
  userId: string,
  storeId: number,
  endpoint: string
): Promise<{ removed: boolean }> {
  await storeStaffRepository.assertStoreMember(storeId, userId)
  const removed = await webPushRepository.deleteWebPushSubscriptionForStoreUser(
    storeId,
    userId,
    endpoint
  )
  return { removed }
}

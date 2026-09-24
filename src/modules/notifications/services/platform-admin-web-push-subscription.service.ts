import { AppError } from '../../../shared/errors/app.error.js'
import { isPlatformAdmin } from '../../../shared/lib/platform-admin.js'
import * as adminWebPushRepository from '../repositories/platform-admin-web-push-subscription.repository.js'
import type { UpsertWebPushSubscriptionInput } from '../types/notification.types.js'

export async function registerPlatformAdminWebPushSubscription(
  userId: string,
  input: UpsertWebPushSubscriptionInput
): Promise<{ registered: true }> {
  if (!isPlatformAdmin(userId)) {
    throw new AppError(403, 'Platform admin only', 'FORBIDDEN')
  }
  await adminWebPushRepository.upsertPlatformAdminWebPushSubscription(userId, input)
  return { registered: true }
}

export async function unregisterPlatformAdminWebPushSubscription(
  userId: string,
  endpoint: string
): Promise<{ removed: boolean }> {
  if (!isPlatformAdmin(userId)) {
    throw new AppError(403, 'Platform admin only', 'FORBIDDEN')
  }
  const removed = await adminWebPushRepository.deletePlatformAdminWebPushSubscriptionForUser(
    userId,
    endpoint
  )
  return { removed }
}

import { AppError } from '../../../shared/errors/app.error.js'
import { isPlatformAdmin } from '../../../shared/lib/platform-admin.js'
import * as adminPushTokenRepository from '../repositories/platform-admin-push-token.repository.js'
import type { UpsertPushTokenInput } from '../types/notification.types.js'

export async function registerPlatformAdminPushToken(
  userId: string,
  input: UpsertPushTokenInput
): Promise<{ registered: true }> {
  if (!isPlatformAdmin(userId)) {
    throw new AppError(403, 'Platform admin only', 'FORBIDDEN')
  }
  await adminPushTokenRepository.upsertPlatformAdminPushToken(userId, input)
  return { registered: true }
}

export async function unregisterPlatformAdminPushToken(
  userId: string,
  expoPushToken: string
): Promise<{ removed: boolean }> {
  if (!isPlatformAdmin(userId)) {
    throw new AppError(403, 'Platform admin only', 'FORBIDDEN')
  }
  const removed = await adminPushTokenRepository.deletePlatformAdminPushTokenForUser(
    userId,
    expoPushToken
  )
  return { removed }
}

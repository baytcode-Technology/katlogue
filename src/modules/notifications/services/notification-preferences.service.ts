import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  mergeNotificationPreferencesUpdate,
  parseStoredNotificationPreferences,
} from '../lib/notification-preferences.js'
import type { Store } from '../../stores/types/store.types.js'
import type {
  NotificationPreferencesView,
  UpdateNotificationPreferencesInput,
} from '../types/notification.types.js'

async function resolveMemberStore(userId: string, storeId: number): Promise<Store> {
  const match = await storeStaffRepository.findStoreByIdForUser(storeId, userId)
  if (!match) {
    throw new AppError(403, 'You do not have access to this store', 'FORBIDDEN')
  }
  return match.store
}

export async function getNotificationPreferencesForOwner(
  ownerId: string,
  storeId: number
): Promise<{ store_id: number; notification_preferences: NotificationPreferencesView }> {
  const store = await resolveMemberStore(ownerId, storeId)

  return {
    store_id: store.id,
    notification_preferences: parseStoredNotificationPreferences(store.notification_preferences),
  }
}

export async function updateNotificationPreferencesForOwner(
  ownerId: string,
  storeId: number,
  input: UpdateNotificationPreferencesInput
): Promise<{ store_id: number; notification_preferences: NotificationPreferencesView }> {
  const store = await resolveMemberStore(ownerId, storeId)

  const current = parseStoredNotificationPreferences(store.notification_preferences)
  const next = mergeNotificationPreferencesUpdate(current, input)
  const updated = await storeRepository.updateNotificationPreferences(store.id, next)

  return {
    store_id: updated.id,
    notification_preferences: parseStoredNotificationPreferences(
      updated.notification_preferences
    ),
  }
}

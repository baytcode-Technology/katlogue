import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  mergeNotificationPreferencesUpdate,
  parseStoredNotificationPreferences,
} from '../lib/notification-preferences.js'
import type {
  NotificationPreferencesView,
  UpdateNotificationPreferencesInput,
} from '../types/notification.types.js'

export async function getNotificationPreferencesForOwner(
  ownerId: string,
  storeId: number
): Promise<{ store_id: number; notification_preferences: NotificationPreferencesView }> {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

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
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

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

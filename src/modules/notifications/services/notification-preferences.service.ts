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
  ownerId: string
): Promise<{ store_id: string; notification_preferences: NotificationPreferencesView }> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found', 'STORE_NOT_FOUND')
  }

  return {
    store_id: store.id,
    notification_preferences: parseStoredNotificationPreferences(store.notification_preferences),
  }
}

export async function updateNotificationPreferencesForOwner(
  ownerId: string,
  input: UpdateNotificationPreferencesInput
): Promise<{ store_id: string; notification_preferences: NotificationPreferencesView }> {
  const store = await storeRepository.findStoreByOwnerId(ownerId)
  if (!store) {
    throw new AppError(404, 'No store found', 'STORE_NOT_FOUND')
  }

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

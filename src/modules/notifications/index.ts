import { Router } from 'express'
import { requireAuth } from '../../shared/middleware/auth.middleware.js'
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js'
import { requiredStoreQuerySchema } from '../stores/validations/store.validation.js'
import { getNotificationPreferences } from './controllers/get-notification-preferences.controller.js'
import { updateNotificationPreferences } from './controllers/update-notification-preferences.controller.js'
import { upsertPushToken } from './controllers/upsert-push-token.controller.js'
import {
  updateNotificationPreferencesSchema,
  upsertPushTokenSchema,
} from './validations/notification.validation.js'

export const notificationRoutes = Router()

notificationRoutes.get(
  '/me/notification-preferences',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  getNotificationPreferences
)
notificationRoutes.patch(
  '/me/notification-preferences',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(updateNotificationPreferencesSchema),
  updateNotificationPreferences
)
notificationRoutes.put(
  '/me/push-token',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(upsertPushTokenSchema),
  upsertPushToken
)

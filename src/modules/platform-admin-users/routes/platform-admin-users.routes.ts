import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { requirePlatformAdmin } from '../../../shared/middleware/platform-admin.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { deletePlatformAdminPushToken } from '../../notifications/controllers/delete-platform-admin-push-token.controller.js'
import { upsertPlatformAdminPushToken } from '../../notifications/controllers/upsert-platform-admin-push-token.controller.js'
import { deletePlatformAdminWebPushSubscription } from '../../notifications/controllers/delete-platform-admin-web-push-subscription.controller.js'
import { upsertPlatformAdminWebPushSubscription } from '../../notifications/controllers/upsert-platform-admin-web-push-subscription.controller.js'
import {
  deletePushTokenSchema,
  deleteWebPushSubscriptionSchema,
  upsertPushTokenSchema,
  upsertWebPushSubscriptionSchema,
} from '../../notifications/validations/notification.validation.js'
import { getPlatformAdminUser } from '../controllers/get-platform-admin-user.controller.js'
import { listPlatformAdminUsers } from '../controllers/list-platform-admin-users.controller.js'
import {
  listPlatformAdminUsersQuerySchema,
  platformAdminUserParamsSchema,
} from '../validations/platform-admin-users.validation.js'

const router = Router()

router.get(
  '/users',
  requireAuth,
  requirePlatformAdmin,
  validateQuery(listPlatformAdminUsersQuerySchema),
  listPlatformAdminUsers
)

router.get(
  '/users/:userId',
  requireAuth,
  requirePlatformAdmin,
  validateParams(platformAdminUserParamsSchema),
  getPlatformAdminUser
)

router.put(
  '/push-token',
  requireAuth,
  requirePlatformAdmin,
  validateBody(upsertPushTokenSchema),
  upsertPlatformAdminPushToken
)

router.delete(
  '/push-token',
  requireAuth,
  requirePlatformAdmin,
  validateBody(deletePushTokenSchema),
  deletePlatformAdminPushToken
)

router.put(
  '/web-push-subscription',
  requireAuth,
  requirePlatformAdmin,
  validateBody(upsertWebPushSubscriptionSchema),
  upsertPlatformAdminWebPushSubscription
)

router.delete(
  '/web-push-subscription',
  requireAuth,
  requirePlatformAdmin,
  validateBody(deleteWebPushSubscriptionSchema),
  deletePlatformAdminWebPushSubscription
)

export default router

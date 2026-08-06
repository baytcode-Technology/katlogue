import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { getInboxAiSettings } from '../controllers/get-settings.controller.js'
import { updateInboxAiSettings } from '../controllers/update-settings.controller.js'
import {
  inboxAiStoreParamsSchema,
  updateInboxAiSettingsSchema,
} from '../validations/inbox-ai.validation.js'

const router = Router({ mergeParams: true })

router.get(
  '/settings',
  requireAuth,
  validateParams(inboxAiStoreParamsSchema),
  getInboxAiSettings
)

router.patch(
  '/settings',
  requireAuth,
  validateParams(inboxAiStoreParamsSchema),
  validateBody(updateInboxAiSettingsSchema),
  updateInboxAiSettings
)

export default router

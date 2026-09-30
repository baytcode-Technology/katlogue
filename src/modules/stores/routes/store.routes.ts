import { Router } from 'express'
import { createStore } from '../controllers/create-store.controller.js'
import { getMyStore } from '../controllers/get-my-store.controller.js'
import { listMyStores } from '../controllers/list-my-stores.controller.js'
import {
  inviteStoreStaff,
  listStoreStaff,
  removeStoreStaff,
} from '../controllers/store-staff.controller.js'
import { updateMyStore } from '../controllers/update-my-store.controller.js'
import {
  deleteCustomDomain,
  getCustomDomain,
  setCustomDomain,
  verifyCustomDomain,
} from '../controllers/custom-domain.controller.js'
import inboxAiRoutes from '../../inbox-ai/routes/inbox-ai.routes.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import {
  createStoreSchema,
  inviteStaffSchema,
  myStoreQuerySchema,
  requiredStoreQuerySchema,
  staffParamsSchema,
  staffStoreQuerySchema,
  updateStoreSchema,
} from '../validations/store.validation.js'
import { setCustomDomainSchema } from '../validations/custom-domain.validation.js'

const router = Router()

router.get('/mine', requireAuth, listMyStores)
router.get(
  '/me',
  requireAuth,
  validateQuery(myStoreQuerySchema),
  getMyStore
)
router.patch(
  '/me',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(updateStoreSchema),
  updateMyStore
)
router.get(
  '/me/custom-domain',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  getCustomDomain
)
router.put(
  '/me/custom-domain',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(setCustomDomainSchema),
  setCustomDomain
)
router.post(
  '/me/custom-domain/verify',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  verifyCustomDomain
)
router.delete(
  '/me/custom-domain',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  deleteCustomDomain
)
router.post('/', validateBody(createStoreSchema), requireAuth, createStore)

router.use('/:storeId/inbox-ai', inboxAiRoutes)

router.get(
  '/staff',
  requireAuth,
  validateQuery(staffStoreQuerySchema),
  listStoreStaff
)
router.post(
  '/staff',
  requireAuth,
  validateQuery(staffStoreQuerySchema),
  validateBody(inviteStaffSchema),
  inviteStoreStaff
)
router.delete(
  '/staff/:id',
  requireAuth,
  validateQuery(staffStoreQuerySchema),
  validateParams(staffParamsSchema),
  removeStoreStaff
)

export default router

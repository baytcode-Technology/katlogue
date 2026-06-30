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
  staffParamsSchema,
  staffStoreQuerySchema,
  updateStoreSchema,
} from '../validations/store.validation.js'

const router = Router()

router.get('/mine', requireAuth, listMyStores)
router.get(
  '/me',
  requireAuth,
  validateQuery(myStoreQuerySchema),
  getMyStore
)
router.patch('/me', requireAuth, validateBody(updateStoreSchema), updateMyStore)
router.post('/', validateBody(createStoreSchema), requireAuth, createStore)

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

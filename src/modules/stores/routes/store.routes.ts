import { Router } from 'express'
import { createStore } from '../controllers/create-store.controller.js'
import { getMyStore } from '../controllers/get-my-store.controller.js'
import { updateMyStore } from '../controllers/update-my-store.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import { createStoreSchema, updateStoreSchema } from '../validations/store.validation.js'

const router = Router()

router.get('/me', requireAuth, getMyStore)
router.patch('/me', requireAuth, validateBody(updateStoreSchema), updateMyStore)
router.post('/', validateBody(createStoreSchema), requireAuth, createStore)

export default router

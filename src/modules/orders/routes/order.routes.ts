import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody, validateQuery } from '../../../shared/middleware/validate.middleware.js'
import { listOrders } from '../controllers/list-orders.controller.js'
import { createMerchantOrder } from '../controllers/create-merchant-order.controller.js'
import {
  listOrdersQuerySchema,
  merchantCreateOrderSchema,
} from '../validations/merchant-order.validation.js'

const router = Router()

router.get('/', validateQuery(listOrdersQuerySchema), requireAuth, listOrders)
router.post('/', validateBody(merchantCreateOrderSchema), requireAuth, createMerchantOrder)

export default router

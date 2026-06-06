import { Router } from 'express'

import { requireAuth } from '../../../shared/middleware/auth.middleware.js'

import {

  validateBody,

  validateParams,

  validateQuery,

} from '../../../shared/middleware/validate.middleware.js'

import { listOrders } from '../controllers/list-orders.controller.js'

import { createMerchantOrder } from '../controllers/create-merchant-order.controller.js'

import { getOrder } from '../controllers/get-order.controller.js'

import { updateOrder } from '../controllers/update-order.controller.js'

import {

  listOrdersQuerySchema,

  merchantCreateOrderSchema,

} from '../validations/merchant-order.validation.js'

import {

  getOrderQuerySchema,

  orderIdParamSchema,

  updateOrderSchema,

} from '../validations/update-order.validation.js'



const router = Router()



router.get('/', validateQuery(listOrdersQuerySchema), requireAuth, listOrders)

router.post('/', validateBody(merchantCreateOrderSchema), requireAuth, createMerchantOrder)

router.get(

  '/:orderId',

  validateParams(orderIdParamSchema),

  validateQuery(getOrderQuerySchema),

  requireAuth,

  getOrder

)

router.patch(

  '/:orderId',

  validateParams(orderIdParamSchema),

  validateBody(updateOrderSchema),

  requireAuth,

  updateOrder

)



export default router



import { Router } from 'express'
import { resolveStoreFromHost } from '../../../shared/middleware/resolve-store.middleware.js'
import { getPublicStore } from '../controllers/public-store.controller.js'
import { getPublicCategories } from '../controllers/public-categories.controller.js'
import { getPublicProducts } from '../controllers/public-products.controller.js'
import { getCatalog } from '../controllers/public-catalog.controller.js'
import { validateBody, validateQuery } from '../../../shared/middleware/validate.middleware.js'
import { catalogQuerySchema } from '../validations/catalog.validation.js'
import { createOrder } from '../../orders/controllers/create-order.controller.js'
import { getPublicOrderStatus } from '../../orders/controllers/get-public-order-status.controller.js'
import { storefrontCreateOrderSchema } from '../../orders/validations/storefront-order.validation.js'
import { getPublicCustomerByPhone } from '../../customers/controllers/get-public-customer-by-phone.controller.js'
import { publicCustomerByPhoneQuerySchema } from '../../customers/validations/customer.validation.js'
import { publicOrderStatusQuerySchema } from '../../payments/validations/payment-config.validation.js'

const router = Router()

router.use(resolveStoreFromHost)

router.get('/store', getPublicStore)
router.get('/catalog', validateQuery(catalogQuerySchema), getCatalog)
router.get('/categories', getPublicCategories)
router.get('/products', getPublicProducts)
router.get(
  '/customers/by-phone',
  validateQuery(publicCustomerByPhoneQuerySchema),
  getPublicCustomerByPhone
)
router.post('/orders', validateBody(storefrontCreateOrderSchema), createOrder)
router.get(
  '/orders/:orderId/status',
  validateQuery(publicOrderStatusQuerySchema),
  getPublicOrderStatus
)

export default router

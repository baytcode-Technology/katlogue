import { Router } from 'express'
import { resolveStoreFromHost } from '../../../shared/middleware/resolve-store.middleware.js'
import { getPublicStore } from '../controllers/public-store.controller.js'
import { getPublicCategories } from '../controllers/public-categories.controller.js'
import { getPublicProducts } from '../controllers/public-products.controller.js'
import { getCatalog } from '../controllers/public-catalog.controller.js'
import { validateQuery } from '../../../shared/middleware/validate.middleware.js'
import { catalogQuerySchema } from '../validations/catalog.validation.js'
import { createOrder } from '../../orders/controllers/create-order.controller.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import { createOrderSchema } from '../../orders/validations/order.validation.js'

const router = Router()

router.use(resolveStoreFromHost)

router.get('/store', getPublicStore)
router.get('/catalog', validateQuery(catalogQuerySchema), getCatalog)
router.get('/categories', getPublicCategories)
router.get('/products', getPublicProducts)
router.post('/orders', validateBody(createOrderSchema), createOrder)

export default router

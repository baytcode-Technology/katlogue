import { Router } from 'express'
import { resolveStoreFromHost } from '../../../shared/middleware/resolve-store.middleware.js'
import { getPublicStore } from '../controllers/public-store.controller.js'
import { getPublicCategories } from '../controllers/public-categories.controller.js'
import { getPublicProducts } from '../controllers/public-products.controller.js'

const router = Router()

router.use(resolveStoreFromHost)

router.get('/store', getPublicStore)
router.get('/categories', getPublicCategories)
router.get('/products', getPublicProducts)

export default router

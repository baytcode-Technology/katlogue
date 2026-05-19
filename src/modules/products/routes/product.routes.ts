import { Router } from 'express'
import { createProduct } from '../controllers/create-product.controller.js'
import { listProducts } from '../controllers/list-products.controller.js'
import { updateProduct } from '../controllers/update-product.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { listProductsQuerySchema } from '../validations/list-products.validation.js'
import {
  createProductSchema,
  productIdParamSchema,
  updateProductSchema,
} from '../validations/product.validation.js'

const router = Router()

router.get('/', validateQuery(listProductsQuerySchema), requireAuth, listProducts)
router.post('/', validateBody(createProductSchema), requireAuth, createProduct)
router.patch(
  '/:productId',
  validateParams(productIdParamSchema),
  requireAuth,
  validateBody(updateProductSchema),
  updateProduct
)

export default router

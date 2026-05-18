import { Router } from 'express'
import { createProduct } from '../controllers/create-product.controller.js'
import { updateProduct } from '../controllers/update-product.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
} from '../../../shared/middleware/validate.middleware.js'
import {
  createProductSchema,
  productIdParamSchema,
  updateProductSchema,
} from '../validations/product.validation.js'

const router = Router()

router.post('/', validateBody(createProductSchema), requireAuth, createProduct)
router.patch(
  '/:productId',
  validateParams(productIdParamSchema),
  requireAuth,
  validateBody(updateProductSchema),
  updateProduct
)

export default router

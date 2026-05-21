import { Router } from 'express'
import { createProduct } from '../controllers/create-product.controller.js'
import { createVariant } from '../controllers/create-variant.controller.js'
import { deleteVariant } from '../controllers/delete-variant.controller.js'
import { getProduct } from '../controllers/get-product.controller.js'
import { listProducts } from '../controllers/list-products.controller.js'
import { updateProduct } from '../controllers/update-product.controller.js'
import { updateVariant } from '../controllers/update-variant.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { listProductsQuerySchema } from '../validations/list-products.validation.js'
import {
  createProductSchema,
  createProductVariantSchema,
  productIdParamSchema,
  productVariantParamsSchema,
  updateProductSchema,
  updateProductVariantSchema,
} from '../validations/product.validation.js'

const router = Router()

router.get('/', validateQuery(listProductsQuerySchema), requireAuth, listProducts)
router.get(
  '/:productId',
  validateParams(productIdParamSchema),
  requireAuth,
  getProduct
)
router.post(
  '/:productId/variants',
  validateParams(productIdParamSchema),
  requireAuth,
  validateBody(createProductVariantSchema),
  createVariant
)
router.patch(
  '/:productId/variants/:variantId',
  validateParams(productVariantParamsSchema),
  requireAuth,
  validateBody(updateProductVariantSchema),
  updateVariant
)
router.delete(
  '/:productId/variants/:variantId',
  validateParams(productVariantParamsSchema),
  requireAuth,
  deleteVariant
)
router.post('/', validateBody(createProductSchema), requireAuth, createProduct)
router.patch(
  '/:productId',
  validateParams(productIdParamSchema),
  requireAuth,
  validateBody(updateProductSchema),
  updateProduct
)

export default router

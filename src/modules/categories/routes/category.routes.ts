import { Router } from 'express'
import { createCategory } from '../controllers/create-category.controller.js'
import { listCategories } from '../controllers/list-categories.controller.js'
import { syncCategoryProducts } from '../controllers/sync-category-products.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import {
  createCategorySchema,
  listCategoriesQuerySchema,
} from '../validations/category.validation.js'
import {
  categoryIdParamSchema,
  syncCategoryProductsSchema,
} from '../validations/sync-category-products.validation.js'

const router = Router()

router.get('/', validateQuery(listCategoriesQuerySchema), requireAuth, listCategories)
router.post('/', validateBody(createCategorySchema), requireAuth, createCategory)
router.put(
  '/:categoryId/products',
  validateParams(categoryIdParamSchema),
  validateBody(syncCategoryProductsSchema),
  requireAuth,
  syncCategoryProducts
)

export default router

import { Router } from 'express'
import { createCategory } from '../controllers/create-category.controller.js'
import { deleteCategory } from '../controllers/delete-category.controller.js'
import { listCategories } from '../controllers/list-categories.controller.js'
import { syncCategoryProducts } from '../controllers/sync-category-products.controller.js'
import { updateCategory } from '../controllers/update-category.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
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
router.patch(
  '/:categoryId',
  validateParams(categoryIdParamSchema),
  validateBody(updateCategorySchema),
  requireAuth,
  updateCategory
)
router.delete(
  '/:categoryId',
  validateParams(categoryIdParamSchema),
  requireAuth,
  deleteCategory
)

export default router

import { Router } from 'express'
import { createCategory } from '../controllers/create-category.controller.js'
import { listCategories } from '../controllers/list-categories.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody, validateQuery } from '../../../shared/middleware/validate.middleware.js'
import {
  createCategorySchema,
  listCategoriesQuerySchema,
} from '../validations/category.validation.js'

const router = Router()

router.get('/', validateQuery(listCategoriesQuerySchema), requireAuth, listCategories)
router.post('/', validateBody(createCategorySchema), requireAuth, createCategory)

export default router

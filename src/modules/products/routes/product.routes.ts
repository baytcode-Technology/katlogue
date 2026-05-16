import { Router } from 'express'
import { createProduct } from '../controllers/create-product.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import { createProductSchema } from '../validations/product.validation.js'

const router = Router()

router.post('/', validateBody(createProductSchema), requireAuth, createProduct)

export default router

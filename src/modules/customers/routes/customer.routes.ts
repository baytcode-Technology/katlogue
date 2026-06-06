import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody, validateQuery } from '../../../shared/middleware/validate.middleware.js'
import { createCustomer } from '../controllers/create-customer.controller.js'
import { listCustomers } from '../controllers/list-customers.controller.js'
import {
  createCustomerSchema,
  listCustomersQuerySchema,
} from '../validations/customer.validation.js'

const router = Router()

router.get('/', validateQuery(listCustomersQuerySchema), requireAuth, listCustomers)
router.post('/', validateBody(createCustomerSchema), requireAuth, createCustomer)

export default router

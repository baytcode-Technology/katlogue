import { Router } from 'express'
import { requireAuth } from '../../shared/middleware/auth.middleware.js'
import { validateBody } from '../../shared/middleware/validate.middleware.js'
import { getPaymentConfig } from './controllers/get-payment-config.controller.js'
import { updatePaymentConfig } from './controllers/update-payment-config.controller.js'
import { updatePaymentConfigSchema } from './validations/payment-config.validation.js'

export const paymentConfigRoutes = Router()

paymentConfigRoutes.get('/me/payment-config', requireAuth, getPaymentConfig)
paymentConfigRoutes.patch(
  '/me/payment-config',
  requireAuth,
  validateBody(updatePaymentConfigSchema),
  updatePaymentConfig
)

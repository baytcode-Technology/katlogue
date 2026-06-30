import { Router } from 'express'
import { requireAuth } from '../../shared/middleware/auth.middleware.js'
import { validateBody, validateQuery } from '../../shared/middleware/validate.middleware.js'
import { requiredStoreQuerySchema } from '../stores/validations/store.validation.js'
import { getPaymentConfig } from './controllers/get-payment-config.controller.js'
import { updatePaymentConfig } from './controllers/update-payment-config.controller.js'
import { createRazorpaySetupTestCheckout } from './controllers/create-razorpay-setup-test.controller.js'
import { verifyRazorpaySetupTest } from './controllers/verify-razorpay-setup-test.controller.js'
import { updatePaymentConfigSchema } from './validations/payment-config.validation.js'
import { verifyRazorpaySetupTestBodySchema } from './validations/razorpay-setup-test.validation.js'

export const paymentConfigRoutes = Router()

paymentConfigRoutes.get(
  '/me/payment-config',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  getPaymentConfig
)
paymentConfigRoutes.patch(
  '/me/payment-config',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(updatePaymentConfigSchema),
  updatePaymentConfig
)
paymentConfigRoutes.post(
  '/me/payment-config/razorpay/test-checkout',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  createRazorpaySetupTestCheckout
)
paymentConfigRoutes.post(
  '/me/payment-config/razorpay/verify-test',
  requireAuth,
  validateQuery(requiredStoreQuerySchema),
  validateBody(verifyRazorpaySetupTestBodySchema),
  verifyRazorpaySetupTest
)

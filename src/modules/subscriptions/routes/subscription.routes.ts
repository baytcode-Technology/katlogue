import { Router } from 'express'
import express from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { createSubscriptionCheckout } from '../controllers/create-checkout.controller.js'
import { verifySubscriptionPayment } from '../controllers/verify-payment.controller.js'
import { getSubscriptionCheckoutStatus } from '../controllers/get-checkout-status.controller.js'
import { verifySubscriptionPaymentSchema } from '../validations/subscription.validation.js'
import * as processPlatformWebhookService from '../services/process-platform-webhook.service.js'

export const subscriptionRoutes = Router()

subscriptionRoutes.post('/checkout', requireAuth, createSubscriptionCheckout)
subscriptionRoutes.post(
  '/verify',
  requireAuth,
  validateBody(verifySubscriptionPaymentSchema),
  verifySubscriptionPayment
)
subscriptionRoutes.get('/status', requireAuth, getSubscriptionCheckoutStatus)

export const platformRazorpayWebhookRoutes = Router()

platformRazorpayWebhookRoutes.post(
  '/',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body)

    await processPlatformWebhookService.processPlatformRazorpayWebhook(
      rawBody,
      req.headers['x-razorpay-signature'] as string | undefined
    )

    res.status(200).json({ success: true })
  })
)

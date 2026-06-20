import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const verifySubscriptionPaymentSchema = z.object({
  checkout_id: entityId('Invalid checkout id'),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
})

export const checkoutStatusQuerySchema = z.object({
  checkout_id: entityId('Invalid checkout id'),
})

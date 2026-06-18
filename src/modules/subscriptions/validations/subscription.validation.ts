import { z } from 'zod'

export const verifySubscriptionPaymentSchema = z.object({
  checkout_id: z.string().uuid(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
})

export const checkoutStatusQuerySchema = z.object({
  checkout_id: z.string().uuid(),
})

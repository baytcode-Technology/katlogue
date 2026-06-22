import { z } from 'zod'

export const verifyRazorpayPaymentBodySchema = z.object({
  checkout_token: z.string().trim().min(16).max(128),
  razorpay_order_id: z.string().trim().min(4).max(100),
  razorpay_payment_id: z.string().trim().min(4).max(100),
  razorpay_signature: z.string().trim().min(8).max(256),
})

export type VerifyRazorpayPaymentBody = z.infer<typeof verifyRazorpayPaymentBodySchema>

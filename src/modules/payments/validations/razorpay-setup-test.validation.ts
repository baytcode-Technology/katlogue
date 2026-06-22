import { z } from 'zod'
import { verifyRazorpayPaymentBodySchema } from './verify-razorpay-payment.validation.js'

export const verifyRazorpaySetupTestBodySchema = verifyRazorpayPaymentBodySchema.extend({
  order_id: z.number().int().positive(),
})

export type VerifyRazorpaySetupTestBody = z.infer<typeof verifyRazorpaySetupTestBodySchema>

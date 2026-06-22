import { z } from 'zod'
import { optionalTrimmedString, orderItemSchema } from '../../../shared/validations/zod-helpers.js'
import { storefrontShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

export const storefrontCreateOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  payment_method: z.enum(['razorpay', 'cod', 'upi'], {
    message: 'Payment method is required',
  }),
  payment_proof_url: optionalTrimmedString(2000).refine((val) => !val || /^https?:\/\//i.test(val), {
    message: 'payment_proof_url must be a valid URL',
  }).optional(),
  shipping_address: storefrontShippingAddressSchema,
  notes: optionalTrimmedString(1000),
}).superRefine((val, ctx) => {
  if (val.payment_method === 'upi') {
    if (!val.payment_proof_url) {
      ctx.addIssue({
        code: 'custom',
        message: 'payment_proof_url is required for UPI orders',
        path: ['payment_proof_url'],
      })
    }
  }
})

export type StorefrontCreateOrderBody = z.infer<typeof storefrontCreateOrderSchema>

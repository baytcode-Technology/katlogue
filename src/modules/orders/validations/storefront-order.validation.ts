import { z } from 'zod'
import { optionalTrimmedString, orderItemSchema } from '../../../shared/validations/zod-helpers.js'
import { storefrontShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

export const storefrontCreateOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  payment_method: z.enum(['razorpay', 'cod', 'upi'], {
    message: 'Payment method is required',
  }),
  shipping_address: storefrontShippingAddressSchema,
  notes: optionalTrimmedString(1000),
})

export type StorefrontCreateOrderBody = z.infer<typeof storefrontCreateOrderSchema>

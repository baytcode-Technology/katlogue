import { z } from 'zod'
import {
  emptyToUndefined,
  optionalEmail,
  optionalTrimmedString,
  optionalUuid,
  orderItemSchema,
} from '../../../shared/validations/zod-helpers.js'
import { storefrontShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

export const storefrontCreateOrderSchema = z
  .object({
    customer_id: optionalUuid('Invalid customer id'),
    whatsapp_number: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(8).max(20).optional()
    ),
    name: optionalTrimmedString(200),
    email: optionalEmail(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    payment_method: z.enum(['razorpay', 'cod', 'upi'], {
      message: 'Payment method is required',
    }),
    shipping_address: storefrontShippingAddressSchema,
    notes: optionalTrimmedString(1000),
    conversation_id: optionalUuid('Invalid conversation id'),
    offline: z.literal(false).optional(),
  })
  .superRefine((data, ctx) => {
    const phone =
      data.whatsapp_number?.trim() || data.shipping_address.phone_number?.trim()
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phone number is required (whatsapp_number or shipping_address.phone_number)',
        path: ['whatsapp_number'],
      })
    }
  })

export type StorefrontCreateOrderBody = z.infer<typeof storefrontCreateOrderSchema>

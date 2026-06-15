import { z } from 'zod'
import { storefrontShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

const orderItemSchema = z.object({
  product_id: z.uuid('Invalid product id'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  variant_id: z.uuid('Invalid variant id').optional(),
})

export const storefrontCreateOrderSchema = z
  .object({
    customer_id: z.uuid('Invalid customer id').optional(),
    whatsapp_number: z.string().trim().min(8).max(20).optional(),
    name: z.string().trim().max(200).optional(),
    email: z.email('Invalid email').optional(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    payment_method: z.enum(['razorpay', 'cod', 'upi'], {
      message: 'Payment method is required',
    }),
    shipping_address: storefrontShippingAddressSchema,
    notes: z.string().trim().max(1000).optional(),
    conversation_id: z.uuid('Invalid conversation id').optional(),
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

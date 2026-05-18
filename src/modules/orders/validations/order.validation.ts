import { z } from 'zod'
import { shippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

const orderItemSchema = z.object({
  product_id: z.uuid('Invalid product id'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  variant_id: z.uuid('Invalid variant id').optional(),
})

export const createOrderSchema = z.object({
  whatsapp_number: z
    .string()
    .trim()
    .min(8, 'WhatsApp number is required')
    .max(20, 'WhatsApp number is too long'),
  name: z.string().trim().max(200).optional(),
  email: z.email('Invalid email').optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  payment_method: z.enum(['razorpay', 'cod']),
  shipping_address: shippingAddressSchema,
  notes: z.string().trim().max(1000).optional(),
  conversation_id: z.uuid('Invalid conversation id').optional(),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>

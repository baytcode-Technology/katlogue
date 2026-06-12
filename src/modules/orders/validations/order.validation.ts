import { z } from 'zod'
import { optionalShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

const orderItemSchema = z.object({
  product_id: z.uuid('Invalid product id'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  variant_id: z.uuid('Invalid variant id').optional(),
})

export const createOrderSchema = z.object({
  customer_id: z.uuid('Invalid customer id').optional(),
  whatsapp_number: z.string().trim().min(8).max(20).optional(),
  name: z.string().trim().max(200).optional(),
  email: z.email('Invalid email').optional(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  payment_method: z.enum(['razorpay', 'cod', 'upi']).default('cod'),
  shipping_address: optionalShippingAddressSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  conversation_id: z.uuid('Invalid conversation id').optional(),
  /** Merchant POS: allow oversell and negative stock. Storefront: reject insufficient stock. */
  offline: z.boolean().default(false),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>

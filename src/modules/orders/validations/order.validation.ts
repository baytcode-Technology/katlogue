import { z } from 'zod'
import {
  emptyToUndefined,
  optionalEmail,
  optionalTrimmedString,
  optionalUuid,
  orderItemSchema,
} from '../../../shared/validations/zod-helpers.js'
import { optionalShippingAddressSchema } from '../../../shared/validations/shipping-address.validation.js'

export { orderItemSchema }

export const createOrderSchema = z.object({
  customer_id: optionalUuid('Invalid customer id'),
  whatsapp_number: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(8).max(20).optional()
  ),
  name: optionalTrimmedString(200),
  email: optionalEmail(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  payment_method: z.enum(['razorpay', 'cod', 'upi']).default('cod'),
  shipping_address: optionalShippingAddressSchema.optional(),
  notes: optionalTrimmedString(1000),
  conversation_id: optionalUuid('Invalid conversation id'),
  /** Merchant POS: allow oversell and negative stock. Storefront: reject insufficient stock. */
  offline: z.boolean().default(false),
})

export type CreateOrderBody = z.infer<typeof createOrderSchema>

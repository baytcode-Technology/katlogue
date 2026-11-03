import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const orderLifecycleStatusSchema = z.enum([
  'pending',
  'confirmed',
  'completed',
  'cancelled',
])

export const orderPaymentStatusSchema = z.enum([
  'pending',
  'confirming',
  'paid',
  'refunded',
])

export const orderFulfillmentStatusSchema = z.enum([
  'unfulfilled',
  'ready',
  'fulfilled',
])

const optionalText = z.union([z.string().trim().max(500), z.null()]).optional()

export const updateOrderSchema = z
  .object({
    store_id: entityId('Invalid store id'),
    order_status: orderLifecycleStatusSchema.optional(),
    payment_status: orderPaymentStatusSchema.optional(),
    fulfillment_status: orderFulfillmentStatusSchema.optional(),
    promised_by: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    delay_note: optionalText,
    courier_name: optionalText,
    tracking_url: z.union([z.string().trim().url(), z.literal(''), z.null()]).optional()
      .transform((v) => (v === '' ? null : v)),
    tracking_number: optionalText,
  })
  .refine(
    (data) =>
      data.order_status !== undefined ||
      data.payment_status !== undefined ||
      data.fulfillment_status !== undefined ||
      data.promised_by !== undefined ||
      data.delay_note !== undefined ||
      data.courier_name !== undefined ||
      data.tracking_url !== undefined ||
      data.tracking_number !== undefined,
    { message: 'At least one field is required to update' }
  )

export const getOrderQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export const orderIdParamSchema = z.object({
  orderId: entityId('Invalid order id'),
})

export type UpdateOrderBody = z.infer<typeof updateOrderSchema>
export type GetOrderQuery = z.infer<typeof getOrderQuerySchema>
export type OrderIdParam = z.infer<typeof orderIdParamSchema>

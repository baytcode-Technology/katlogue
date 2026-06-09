import { z } from 'zod'

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

export const updateOrderSchema = z
  .object({
    store_id: z.uuid('Invalid store id'),
    order_status: orderLifecycleStatusSchema.optional(),
    payment_status: orderPaymentStatusSchema.optional(),
    fulfillment_status: orderFulfillmentStatusSchema.optional(),
  })
  .refine(
    (data) =>
      data.order_status !== undefined ||
      data.payment_status !== undefined ||
      data.fulfillment_status !== undefined,
    { message: 'At least one status field is required to update' }
  )

export const getOrderQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
})

export const orderIdParamSchema = z.object({
  orderId: z.uuid('Invalid order id'),
})

export type UpdateOrderBody = z.infer<typeof updateOrderSchema>
export type GetOrderQuery = z.infer<typeof getOrderQuerySchema>
export type OrderIdParam = z.infer<typeof orderIdParamSchema>


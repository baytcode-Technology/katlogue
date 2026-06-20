import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'
import { createOrderSchema } from './order.validation.js'

export const listOrdersQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export const merchantCreateOrderSchema = createOrderSchema.extend({
  store_id: entityId('Invalid store id'),
})

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>
export type MerchantCreateOrderBody = z.infer<typeof merchantCreateOrderSchema>

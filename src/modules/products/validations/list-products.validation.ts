import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const listProductsQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>

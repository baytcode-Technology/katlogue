import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const categoryIdParamSchema = z.object({
  categoryId: entityId('Invalid category id'),
})

export const syncCategoryProductsSchema = z.object({
  store_id: entityId('Invalid store id'),
  product_ids: z.array(entityId('Invalid product id')),
})

export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>
export type SyncCategoryProductsBody = z.infer<typeof syncCategoryProductsSchema>

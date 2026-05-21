import { z } from 'zod'

export const categoryIdParamSchema = z.object({
  categoryId: z.uuid('Invalid category id'),
})

export const syncCategoryProductsSchema = z.object({
  store_id: z.uuid('Invalid store id'),
  product_ids: z.array(z.uuid('Invalid product id')),
})

export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>
export type SyncCategoryProductsBody = z.infer<typeof syncCategoryProductsSchema>

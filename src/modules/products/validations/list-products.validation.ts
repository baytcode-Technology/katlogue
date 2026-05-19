import { z } from 'zod'

export const listProductsQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
})

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>

import { z } from 'zod'

export const catalogQuerySchema = z
  .object({
    category_id: z.uuid('Invalid category id').optional(),
    product_id: z.uuid('Invalid product id').optional(),
    sort: z
      .enum(['default', 'name_asc', 'name_desc', 'price_asc', 'price_desc'])
      .optional()
      .default('default'),
    min_price: z.coerce.number().min(0, 'min_price must be 0 or greater').optional(),
    max_price: z.coerce.number().min(0, 'max_price must be 0 or greater').optional(),
  })
  .refine(
    (data) =>
      data.min_price === undefined ||
      data.max_price === undefined ||
      data.min_price <= data.max_price,
    { message: 'min_price cannot be greater than max_price', path: ['min_price'] }
  )

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>

import { z } from 'zod'

export const createProductSchema = z.object({
  store_id: z.uuid('Invalid store id'),
  name: z.string().trim().min(1, 'Product name is required').max(500),
  base_price: z.coerce.number().min(0, 'Base price must be 0 or greater'),
  category_id: z.uuid('Invalid category id').optional(),
  description: z.string().trim().max(5000).optional(),
  sku: z.string().trim().max(100).optional(),
  compare_at_price: z.coerce
    .number()
    .min(0, 'Compare at price must be 0 or greater')
    .optional(),
  track_inventory: z.boolean().default(false),
  stock_qty: z.coerce.number().int().min(0, 'Stock quantity must be 0 or greater').default(0),
  images: z.array(z.string().url('Each image must be a valid URL')).default([]),
  thumbnail_url: z.string().url('Thumbnail must be a valid URL').optional(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type CreateProductBody = z.infer<typeof createProductSchema>

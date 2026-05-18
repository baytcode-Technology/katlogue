import { z } from 'zod'

export const createProductVariantSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required').max(200),
  options: z.record(z.string(), z.unknown()).default({}),
  price_delta: z.coerce.number().default(0),
  stock_qty: z.coerce.number().int().min(0, 'Stock must be 0 or greater').default(0),
  sku: z.string().trim().max(100).optional(),
  image_url: z.string().url('Variant image must be a valid URL').optional(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

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
  variants: z.array(createProductVariantSchema).default([]),
})

export type CreateProductBody = z.infer<typeof createProductSchema>

export const productIdParamSchema = z.object({
  productId: z.uuid('Invalid product id'),
})

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.null()])
const optionalUuid = z.union([z.uuid('Invalid category id'), z.null()])

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name cannot be empty').max(500).optional(),
    base_price: z.coerce.number().min(0, 'Base price must be 0 or greater').optional(),
    category_id: optionalUuid.optional(),
    description: z.union([z.string().trim().max(5000), z.null()]).optional(),
    sku: z.union([z.string().trim().max(100), z.null()]).optional(),
    compare_at_price: z.union([
      z.coerce.number().min(0, 'Compare at price must be 0 or greater'),
      z.null(),
    ]).optional(),
    track_inventory: z.boolean().optional(),
    stock_qty: z.coerce.number().int().min(0, 'Stock quantity must be 0 or greater').optional(),
    images: z.array(z.string().url('Each image must be a valid URL')).optional(),
    thumbnail_url: optionalUrl.optional(),
    is_active: z.boolean().optional(),
    sort_order: z.coerce.number().int().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one field is required to update',
  })

export type UpdateProductBody = z.infer<typeof updateProductSchema>
export type ProductIdParam = z.infer<typeof productIdParamSchema>

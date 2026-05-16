import { z } from 'zod'

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createCategorySchema = z.object({
  store_id: z.uuid('Invalid store id'),
  name: z.string().trim().min(1, 'Category name is required').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(100)
    .transform((s) => s.toLowerCase())
    .refine((s) => slugRegex.test(s), {
      message: 'Slug must be lowercase letters, numbers, and hyphens only',
    }),
  parent_id: z.uuid('Invalid parent category id').optional(),
  image_url: z.string().url('Image must be a valid URL').optional(),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
})

export const listCategoriesQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
})

export type CreateCategoryBody = z.infer<typeof createCategorySchema>
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>

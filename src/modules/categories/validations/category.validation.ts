import { z } from 'zod'
import { entityId, optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const createCategorySchema = z.object({
  store_id: entityId('Invalid store id'),
  name: z.string().trim().min(1, 'Category name is required').max(200),
  parent_id: optionalEntityId('Invalid parent category id'),
  image_url: z
    .union([z.string().url('Category image must be a valid URL'), z.null()])
    .optional(),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
})

export const listCategoriesQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    image_url: z.union([z.string().url(), z.null()]).optional(),
    is_active: z.boolean().optional(),
    description: z.string().max(5000).nullable().optional(),
    parent_id: z
      .union([entityId('Invalid parent category id'), z.null()])
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  })

export type CreateCategoryBody = z.infer<typeof createCategorySchema>
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>

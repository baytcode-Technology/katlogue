import { z } from 'zod'

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const createStoreSchema = z.object({
  name: z.string().trim().min(1, 'Store name is required').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(100)
    .transform((s) => s.toLowerCase())
    .refine((s) => slugRegex.test(s), {
      message: 'Slug must be lowercase letters, numbers, and hyphens only',
    }),
  whatsapp_number: z
    .string()
    .trim()
    .min(8, 'WhatsApp number is required')
    .max(20, 'WhatsApp number is too long'),
  currency: z
    .string()
    .trim()
    .min(3, 'Currency is required')
    .max(3, 'Use a 3-letter currency code')
    .transform((s) => s.toUpperCase()),
})

export type CreateStoreBody = z.infer<typeof createStoreSchema>

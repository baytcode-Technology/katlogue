import { z } from 'zod'
import { isValidSubdomainSlug } from '../../../shared/utils/storefront.js'

export const createStoreSchema = z.object({
  name: z.string().trim().min(1, 'Store name is required').max(200),
  slug: z
    .string()
    .trim()
    .min(3, 'Slug must be at least 3 characters')
    .max(63, 'Slug must be at most 63 characters')
    .transform((s) => s.toLowerCase())
    .refine((s) => isValidSubdomainSlug(s), {
      message:
        'Slug must be 3–63 chars, lowercase letters/numbers/hyphens only, and not a reserved name (e.g. api, app, www)',
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

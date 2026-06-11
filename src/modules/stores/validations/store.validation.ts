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
  description: z.string().trim().max(2000).optional().nullable(),
  logo_url: z
    .union([z.string().trim().url('Logo must be a valid URL'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  banner_url: z
    .union([z.string().trim().url('Banner must be a valid URL'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  timezone: z.string().trim().min(1).max(64).optional(),
  ai_language: z.string().trim().max(16).optional().nullable(),
  ai_system_prompt: z.string().trim().max(8000).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
})

const optionalUrl = z
  .union([z.string().trim().url('Must be a valid URL'), z.literal('')])
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v ?? undefined))

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(1, 'Store name cannot be empty').max(200).optional(),
    slug: z
      .string()
      .trim()
      .min(3, 'Slug must be at least 3 characters')
      .max(63, 'Slug must be at most 63 characters')
      .transform((s) => s.toLowerCase())
      .refine((s) => isValidSubdomainSlug(s), {
        message:
          'Slug must be 3–63 chars, lowercase letters/numbers/hyphens only, and not a reserved name',
      })
      .optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    logo_url: optionalUrl,
    banner_url: optionalUrl,
    whatsapp_number: z
      .string()
      .trim()
      .min(8, 'WhatsApp number is required')
      .max(20, 'WhatsApp number is too long')
      .optional(),
    currency: z
      .string()
      .trim()
      .min(3, 'Currency must be 3 letters')
      .max(3, 'Use a 3-letter currency code')
      .transform((s) => s.toUpperCase())
      .optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    industry: z.union([z.string().trim().max(100), z.null()]).optional(),
    ai_system_prompt: z.union([z.string().trim().max(8000), z.null()]).optional(),
    ai_language: z.union([z.string().trim().max(16), z.null()]).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one field is required to update',
  })

export type CreateStoreBody = z.infer<typeof createStoreSchema>
export type UpdateStoreBody = z.infer<typeof updateStoreSchema>

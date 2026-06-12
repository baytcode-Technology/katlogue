import { z } from 'zod'

const vpaSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/, 'Invalid UPI ID format')

export const updatePaymentConfigSchema = z.object({
  cod: z.object({ enabled: z.boolean() }).optional(),
  razorpay: z
    .object({
      enabled: z.boolean().optional(),
      key_id: z.string().trim().min(8).max(100).optional(),
      key_secret: z.string().trim().min(8).max(200).optional(),
      webhook_secret: z.string().trim().min(8).max(200).optional(),
      mode: z.enum(['test', 'live']).optional(),
    })
    .optional(),
  upi: z
    .object({
      enabled: z.boolean().optional(),
      vpa: vpaSchema.optional(),
      display_name: z.string().trim().max(120).nullable().optional(),
      qr_image_url: z.string().url().nullable().optional(),
    })
    .optional(),
})

export type UpdatePaymentConfigBody = z.infer<typeof updatePaymentConfigSchema>

export const publicOrderStatusQuerySchema = z.object({
  token: z.string().trim().min(16).max(128),
})

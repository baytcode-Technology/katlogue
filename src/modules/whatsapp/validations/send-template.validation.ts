import { z } from 'zod'

export const sendTemplateSchema = z.object({
  to: z
    .string()
    .trim()
    .min(8, 'Recipient number is required')
    .max(20, 'Recipient number is too long'),
  templateName: z.string().trim().min(1, 'Template name is required'),
  languageCode: z.string().trim().min(2).max(10).optional(),
})

export type SendTemplateBody = z.infer<typeof sendTemplateSchema>


import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const inboxAiStoreParamsSchema = z.object({
  storeId: entityId('Invalid store id'),
})

export const updateInboxAiSettingsSchema = z
  .object({
    ai_auto_reply_enabled: z.boolean().optional(),
    ai_system_prompt: z.union([z.string().trim().max(8000), z.null()]).optional(),
    ai_language: z.union([z.string().trim().max(16), z.null()]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  })

export const setReplyModeSchema = z.object({
  reply_mode: z.enum(['ai', 'manual']),
})

export const setReplyModeParamsSchema = z.object({
  conversationId: entityId('Invalid conversation id'),
})

export const setReplyModeQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

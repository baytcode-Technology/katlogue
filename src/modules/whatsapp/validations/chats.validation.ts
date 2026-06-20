import { z } from 'zod'
import { entityId } from '../../../shared/validations/zod-helpers.js'

export const listChatsQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
})

export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>

export const listMessagesParamsSchema = z.object({
  conversationId: entityId('Invalid conversation id'),
})

export type ListMessagesParams = z.infer<typeof listMessagesParamsSchema>

export const listMessagesQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
  limit: z
    .string()
    .optional()
    .transform((v) => Number(v ?? 30))
    .pipe(z.number().int().min(1).max(100)),
  cursor: z.string().optional(),
})

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>

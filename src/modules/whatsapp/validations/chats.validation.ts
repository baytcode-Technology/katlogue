import { z } from 'zod'

export const listChatsQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
})

export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>

export const listMessagesParamsSchema = z.object({
  conversationId: z.uuid('Invalid conversation id'),
})

export type ListMessagesParams = z.infer<typeof listMessagesParamsSchema>

export const listMessagesQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
  limit: z
    .string()
    .optional()
    .transform((v) => Number(v ?? 30))
    .pipe(z.number().int().min(1).max(100)),
  cursor: z.string().optional(),
})

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>


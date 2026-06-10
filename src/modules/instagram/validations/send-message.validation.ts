import { z } from 'zod'

export const sendMessageSchema = z
  .object({
    storeId: z.string().uuid().optional(),
    store_id: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    conversation_id: z.string().uuid().optional(),
    to: z.string().min(1).max(64),
    message: z.string().min(1).max(4096),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })

export type SendMessageBody = z.infer<typeof sendMessageSchema>

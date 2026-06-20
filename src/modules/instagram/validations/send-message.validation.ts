import { z } from 'zod'
import { optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const sendMessageSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    conversationId: optionalEntityId('Invalid conversation id'),
    conversation_id: optionalEntityId('Invalid conversation id'),
    to: z.string().min(1).max(64),
    message: z.string().min(1).max(4096),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })

export type SendMessageBody = z.infer<typeof sendMessageSchema>
